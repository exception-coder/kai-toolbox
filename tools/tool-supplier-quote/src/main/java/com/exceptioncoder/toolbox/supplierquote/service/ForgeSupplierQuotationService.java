package com.exceptioncoder.toolbox.supplierquote.service;

import com.exceptioncoder.toolbox.supplierquote.repository.ForgeSupplierQuoteStore;
import com.regentech_fashion.supplierquote.api.SupplierQuoteApiException;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.*;
import com.regentech_fashion.supplierquote.spi.SupplierQuotationUseCase;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class ForgeSupplierQuotationService implements SupplierQuotationUseCase {
    private static final String DEMO_TICKET = "demo-quote";
    private static final Set<String> ITEM_IDS = Set.of("item_01", "item_02");
    private final ForgeSupplierQuoteStore repository;
    private final ObjectMapper objectMapper;

    public ForgeSupplierQuotationService(ForgeSupplierQuoteStore repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Override
    public BindingView requireBinding(String subjectHash) {
        return repository.findBindingBySubject(subjectHash).orElseThrow(() ->
                new SupplierQuoteApiException(HttpStatus.PRECONDITION_REQUIRED, "SCM_BINDING_REQUIRED",
                        "请先使用 SCM 账号完成首次关联"));
    }

    @Override
    public QuotationAccess access(String ticket, BindingView binding) {
        requireDemoTicket(ticket);
        var submission = repository.findSubmission(ticket, binding.scmUserId());
        var draft = repository.findDraft(ticket, binding.scmUserId());
        List<QuoteItem> items = defaultItems();
        String overallRemark = "";
        int version = 0;
        if (draft.isPresent()) {
            QuotationDraftRequest saved = read(draft.get().payloadJson());
            items = mergeDraft(saved.items());
            overallRemark = saved.overallRemark() == null ? "" : saved.overallRemark();
            version = draft.get().draftVersion();
        }
        boolean submitted = submission.isPresent();
        return new QuotationAccess("qr_20260815018", "XJ20260815018", "秋冬针织面料询价",
                "凯纺供应链", binding.supplierName(), binding.displayName(), submitted ? "SUBMITTED" : "OPEN",
                !submitted, Instant.now().plus(2, ChronoUnit.DAYS).toString(), "CNY", true, items,
                overallRemark, version,
                submission.map(row -> Instant.ofEpochMilli(row.submittedAt()).toString()).orElse(null),
                submitted ? "PENDING" : "NOT_STARTED");
    }

    @Transactional
    @Override
    public DraftReceipt saveDraft(String ticket, BindingView binding, QuotationDraftRequest request) {
        requireDemoTicket(ticket);
        validate(request);
        if (repository.findSubmission(ticket, binding.scmUserId()).isPresent()) {
            throw new SupplierQuoteApiException(HttpStatus.CONFLICT, "QUOTATION_ALREADY_SUBMITTED", "报价已提交，不能再保存草稿");
        }
        long now = System.currentTimeMillis();
        var saved = repository.saveDraft(ticket, binding.scmUserId(), write(request), request.draftVersion(), now);
        if (saved == null) {
            throw new SupplierQuoteApiException(HttpStatus.CONFLICT, "DRAFT_VERSION_CONFLICT", "草稿已在其他页面更新，请刷新后重试");
        }
        return new DraftReceipt(saved.draftVersion(), Instant.ofEpochMilli(saved.savedAt()).toString());
    }

    @Transactional
    @Override
    public SubmissionReceipt submit(String ticket, BindingView binding, String idempotencyKey,
                                    QuotationDraftRequest request) {
        requireDemoTicket(ticket);
        if (!Boolean.TRUE.equals(request.confirmed())) {
            throw new SupplierQuoteApiException(HttpStatus.BAD_REQUEST, "CONFIRMATION_REQUIRED", "请确认后再提交报价");
        }
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new SupplierQuoteApiException(HttpStatus.BAD_REQUEST, "IDEMPOTENCY_KEY_REQUIRED", "缺少幂等键");
        }
        validate(request);
        var existing = repository.findSubmission(ticket, binding.scmUserId());
        if (existing.isPresent()) {
            if (!existing.get().idempotencyKey().equals(idempotencyKey)) {
                throw new SupplierQuoteApiException(HttpStatus.CONFLICT, "QUOTATION_ALREADY_SUBMITTED", "该报价已提交");
            }
            return receipt(existing.get().submissionId(), existing.get().submittedAt());
        }
        var savedDraft = repository.saveDraft(ticket, binding.scmUserId(), write(request), request.draftVersion(),
                System.currentTimeMillis());
        if (savedDraft == null) {
            throw new SupplierQuoteApiException(HttpStatus.CONFLICT, "DRAFT_VERSION_CONFLICT", "草稿版本冲突，请刷新后重试");
        }
        long now = System.currentTimeMillis();
        String submissionId = "sub_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        repository.insertSubmission(ticket, binding.scmUserId(), idempotencyKey, submissionId, write(request), now);
        return receipt(submissionId, now);
    }

    private static void requireDemoTicket(String ticket) {
        if (!DEMO_TICKET.equals(ticket)) {
            throw new SupplierQuoteApiException(HttpStatus.NOT_FOUND, "QUOTE_TICKET_NOT_FOUND", "没有找到对应报价任务");
        }
    }

    private static void validate(QuotationDraftRequest request) {
        if (request.items() == null || request.items().size() != ITEM_IDS.size()
                || !request.items().stream().map(QuoteLineDraft::itemId).collect(java.util.stream.Collectors.toSet()).equals(ITEM_IDS)) {
            throw new SupplierQuoteApiException(HttpStatus.BAD_REQUEST, "ITEM_NOT_FOUND", "报价明细与询价单不一致");
        }
        for (QuoteLineDraft line : request.items()) {
            BigDecimal price = positive(line.unitPrice(), "单价");
            if (price.scale() > 4) throw invalid("单价最多支持四位小数");
            BigDecimal tax = decimal(line.taxRate(), "税率");
            if (tax.signum() < 0 || tax.compareTo(BigDecimal.valueOf(100)) > 0) throw invalid("税率必须在 0 到 100 之间");
            positive(line.moq(), "起订量");
            if (line.deliveryDays() == null || line.deliveryDays() <= 0) throw invalid("交期必须大于 0 天");
        }
    }

    private static BigDecimal positive(String value, String label) {
        BigDecimal decimal = decimal(value, label);
        if (decimal.signum() <= 0) throw invalid(label + "必须大于 0");
        return decimal;
    }

    private static BigDecimal decimal(String value, String label) {
        try { return new BigDecimal(value); }
        catch (RuntimeException exception) { throw invalid(label + "格式不正确"); }
    }

    private static SupplierQuoteApiException invalid(String message) {
        return new SupplierQuoteApiException(HttpStatus.BAD_REQUEST, "INVALID_PRICE", message);
    }

    private List<QuoteItem> mergeDraft(List<QuoteLineDraft> lines) {
        return defaultItems().stream().map(item -> new QuoteItem(item.itemId(), item.materialCode(), item.materialName(),
                item.specification(), item.quantity(), item.unit(), lines.stream()
                .filter(line -> line.itemId().equals(item.itemId())).findFirst().orElse(item.draft()))).toList();
    }

    private static List<QuoteItem> defaultItems() {
        return List.of(
                new QuoteItem("item_01", "MAT-4012", "40S锦氨罗马布", "320g/m² · 150cm", "5000", "米",
                        new QuoteLineDraft("item_01", "18.6000", "13", 12, "1000", "含运费")),
                new QuoteItem("item_02", "MAT-8068", "双面空气层", "280g/m² · 160cm", "3200", "米",
                        new QuoteLineDraft("item_02", "16.8000", "13", 10, "800", "现货坯布")));
    }

    private String write(QuotationDraftRequest request) {
        try { return objectMapper.writeValueAsString(request); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("quotation serialization failed", exception); }
    }

    private QuotationDraftRequest read(String json) {
        try { return objectMapper.readValue(json, QuotationDraftRequest.class); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("quotation draft data is invalid", exception); }
    }

    private static SubmissionReceipt receipt(String id, long submittedAt) {
        return new SubmissionReceipt(id, Instant.ofEpochMilli(submittedAt).toString(), "XJ20260815018", "PENDING");
    }
}
