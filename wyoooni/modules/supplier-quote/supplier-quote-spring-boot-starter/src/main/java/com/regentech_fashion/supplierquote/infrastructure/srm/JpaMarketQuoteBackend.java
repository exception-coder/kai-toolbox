package com.regentech_fashion.supplierquote.infrastructure.srm;

import com.regentech_fashion.supplierquote.api.SupplierQuoteApiException;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteItem;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuotePage;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuotePriceInput;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteQuery;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteSubmissionResult;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.YarnQualityStandards;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView;
import com.regentech_fashion.supplierquote.domain.MarketQuoteBusinessStatus;
import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.entity.MarketQuoteCycleEntity;
import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.entity.MarketQuotePriceEntity;
import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.entity.YarnQualityStandardEntity;
import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.repository.MarketQuoteCycleRepository;
import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.repository.MarketQuotePriceRepository;
import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.repository.MarketQuoteTaskRepository;
import com.regentech_fashion.supplierquote.infrastructure.srm.persistence.repository.YarnQualityStandardRepository;
import com.regentech_fashion.supplierquote.spi.MarketQuoteBackend;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 直连 MySQL 并闭环市场报价的 JPA 适配器。 */
@Transactional(transactionManager = "marketQuoteTransactionManager", readOnly = true)
public class JpaMarketQuoteBackend implements MarketQuoteBackend {
    private static final int STATUS_TO_BE_QUOTED = -1;
    private static final int STATUS_PENDING_AUDIT = 0;
    private static final int STATUS_APPROVED = 1;
    private static final int STATUS_REJECTED = 2;
    private static final int AUDIT_RETURNED = 3;
    private static final int SOURCE_SUPPLIER = 0;
    private static final int EXCLUDE_TAX = 0;
    private static final int ACTIVE = 0;
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final MarketQuoteCycleRepository cycles;
    private final MarketQuotePriceRepository prices;
    private final MarketQuoteTaskRepository tasks;
    private final YarnQualityStandardRepository standards;

    public JpaMarketQuoteBackend(MarketQuoteCycleRepository cycles,
                                 MarketQuotePriceRepository prices,
                                 MarketQuoteTaskRepository tasks,
                                 YarnQualityStandardRepository standards) {
        this.cycles = cycles;
        this.prices = prices;
        this.tasks = tasks;
        this.standards = standards;
    }

    @Override
    public MarketQuotePage findPage(BindingView binding, MarketQuoteQuery query) {
        Long supplierId = numericId(binding.supplierId(), "供应商");
        Set<Long> pendingIds = new HashSet<>(tasks.findPendingCycleIds(supplierId));
        if ("PENDING".equals(query.tab()) && pendingIds.isEmpty()) {
            return new MarketQuotePage(List.of(), 0, 0, query.pageNo(), query.pageSize());
        }
        PageRequest pageRequest = PageRequest.of(query.pageNo() - 1, query.pageSize(),
                Sort.by(Sort.Direction.DESC, "updateTime"));
        Page<MarketQuoteCycleEntity> page = cycles.findAll(specification(supplierId, query, pendingIds), pageRequest);
        Map<Long, MarketQuotePriceEntity> currentPrices = loadCurrentPrices(page.getContent());
        List<MarketQuoteItem> items = page.getContent().stream()
                .map(cycle -> toItem(cycle, currentPrices.get(cycle.getPriceId()), pendingIds.contains(cycle.getId())))
                .toList();
        return new MarketQuotePage(items, page.getTotalElements(), tasks.countPending(supplierId),
                query.pageNo(), query.pageSize());
    }

    @Override
    @Transactional(transactionManager = "marketQuoteTransactionManager")
    public MarketQuoteSubmissionResult submit(BindingView binding, MarketQuotePriceInput input,
                                               String idempotencyKey) {
        submitOne(binding, input);
        return success(List.of(input));
    }

    @Override
    @Transactional(transactionManager = "marketQuoteTransactionManager")
    public MarketQuoteSubmissionResult submitBatch(BindingView binding, List<MarketQuotePriceInput> items,
                                                    String idempotencyKey) {
        List<MarketQuotePriceInput> lockOrderedItems = new ArrayList<>(items);
        lockOrderedItems.sort(Comparator.comparing(input -> numericId(input.supcId(), "报价轮次")));
        for (MarketQuotePriceInput input : lockOrderedItems) {
            submitOne(binding, input);
        }
        return success(items);
    }

    @Override
    @Transactional(transactionManager = "marketQuoteTransactionManager")
    public void revoke(BindingView binding, String supcId) {
        Long supplierId = numericId(binding.supplierId(), "供应商");
        MarketQuoteCycleEntity cycle = requireLockedCycle(numericId(supcId, "报价轮次"), supplierId);
        if (!Integer.valueOf(STATUS_PENDING_AUDIT).equals(cycle.getPriceStatus()) || cycle.getPriceId() == null) {
            throw conflict("当前报价状态不允许撤回");
        }
        List<MarketQuotePriceEntity> history = prices.findByCycleIdAndDeletedFalseOrderByIdDesc(cycle.getId());
        if (history.isEmpty() || !cycle.getPriceId().equals(history.get(0).getId())) {
            throw conflict("当前报价快照已变更，请刷新后重试");
        }
        MarketQuotePriceEntity current = history.get(0);
        current.setDeleted(true);
        current.setUpdater(actor(binding));
        current.setUpdateTime(LocalDateTime.now());
        prices.save(current);
        restoreCycle(cycle, history.size() > 1 ? history.get(1) : null);
        if (tasks.reopen(cycle.getId(), supplierId, actor(binding)) == 0) {
            throw conflict("没有找到可恢复的报价待办，请刷新后重试");
        }
        cycles.save(cycle);
    }

    @Override
    public YarnQualityStandards findQualityStandards(BindingView binding, String productId) {
        Long supplierId = numericId(binding.supplierId(), "供应商");
        Long numericProductId = numericId(productId, "产品");
        if (!cycles.existsByProductIdAndSupplierIdAndDeletedFalse(numericProductId, supplierId)) {
            throw notFound("当前供应商无权查看该产品质量标准");
        }
        List<YarnQualityStandardEntity> matched = standards.findByProductId(numericProductId);
        if (matched.isEmpty()) {
            throw notFound("当前产品没有配置质量标准");
        }
        return toStandards(matched.get(0));
    }

    private void submitOne(BindingView binding, MarketQuotePriceInput input) {
        Long supplierId = numericId(binding.supplierId(), "供应商");
        MarketQuoteCycleEntity cycle = requireLockedCycle(numericId(input.supcId(), "报价轮次"), supplierId);
        boolean hasTask = tasks.findPendingCycleIds(supplierId).contains(cycle.getId());
        MarketQuotePriceEntity current = cycle.getPriceId() == null
                ? null : prices.findByIdAndDeletedFalse(cycle.getPriceId()).orElse(null);
        requireQuotable(cycle, current, hasTask);
        LocalDateTime now = LocalDateTime.now();
        MarketQuotePriceEntity created = prices.saveAndFlush(newPrice(cycle, current, input, binding, now));
        cycle.setPriceId(created.getId());
        cycle.setPrice(created.getPriceExcludeTax());
        cycle.setPriceIsTax(EXCLUDE_TAX);
        cycle.setPriceStatus(STATUS_PENDING_AUDIT);
        cycle.setRefreshTime(now);
        cycle.setPriceUpdateTime(now);
        cycle.setUpdateTime(now);
        cycles.save(cycle);
        tasks.complete(cycle.getId(), supplierId, actor(binding));
    }

    private static Specification<MarketQuoteCycleEntity> specification(Long supplierId, MarketQuoteQuery query,
                                                                         Set<Long> pendingIds) {
        return (root, criteria, builder) -> {
            List<jakarta.persistence.criteria.Predicate> filters = new ArrayList<>();
            filters.add(builder.equal(root.get("supplierId"), supplierId));
            filters.add(builder.isFalse(root.get("deleted")));
            if (query.productName() != null && !query.productName().isBlank()) {
                filters.add(builder.like(root.get("productName"), "%" + query.productName().trim() + "%"));
            }
            if ("PENDING".equals(query.tab())) {
                filters.add(root.get("id").in(pendingIds));
            }
            Integer status = databaseStatus(query.status());
            if (status != null) {
                filters.add(builder.equal(root.get("priceStatus"), status));
            }
            return builder.and(filters.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
    }

    private Map<Long, MarketQuotePriceEntity> loadCurrentPrices(List<MarketQuoteCycleEntity> page) {
        List<Long> ids = page.stream().map(MarketQuoteCycleEntity::getPriceId).filter(java.util.Objects::nonNull).toList();
        Map<Long, MarketQuotePriceEntity> result = new HashMap<>((int) (ids.size() / 0.75F) + 1);
        prices.findAllById(ids).stream().filter(price -> !Boolean.TRUE.equals(price.getDeleted()))
                .forEach(price -> result.put(price.getId(), price));
        return result;
    }

    private MarketQuoteCycleEntity requireLockedCycle(Long cycleId, Long supplierId) {
        return cycles.findByIdAndSupplierIdAndDeletedFalse(cycleId, supplierId)
                .orElseThrow(() -> notFound("没有找到当前供应商可操作的报价记录"));
    }

    private static void requireQuotable(MarketQuoteCycleEntity cycle, MarketQuotePriceEntity current,
                                        boolean hasTask) {
        if (cycle.getPriceId() == null || hasTask) {
            return;
        }
        if (current != null && Integer.valueOf(AUDIT_RETURNED).equals(current.getAuditResult())) {
            return;
        }
        throw conflict("当前记录不是可报价状态");
    }

    private static MarketQuotePriceEntity newPrice(MarketQuoteCycleEntity cycle, MarketQuotePriceEntity current,
                                                    MarketQuotePriceInput input, BindingView binding,
                                                    LocalDateTime now) {
        MarketQuotePriceEntity price = new MarketQuotePriceEntity();
        price.setCycleId(cycle.getId());
        price.setProductId(cycle.getProductId());
        price.setProductCode(cycle.getProductCode());
        price.setProductName(cycle.getProductName());
        price.setDnumber(cycle.getDnumber());
        price.setColorId(cycle.getColorId());
        price.setColorCode(cycle.getColorCode());
        price.setColorName(cycle.getColorName());
        price.setColorGrade(cycle.getColorGrade());
        price.setCertification(cycle.getCertification());
        price.setSupplierId(cycle.getSupplierId());
        price.setSupplierName(cycle.getSupplierName());
        price.setPriceExcludeTax(new BigDecimal(input.priceExcludeTax()).setScale(2));
        price.setPriceIncludeTax(new BigDecimal(input.priceIncludeTax()).setScale(2));
        price.setPrice(price.getPriceExcludeTax());
        price.setPriceIsTax(EXCLUDE_TAX);
        price.setStatus(STATUS_PENDING_AUDIT);
        price.setSource(SOURCE_SUPPLIER);
        price.setHistory(ACTIVE);
        price.setLastPriceId(current == null ? null : current.getId());
        price.setMarketPrice(ACTIVE);
        price.setCreator(actor(binding));
        price.setUpdater(actor(binding));
        price.setCreateTime(now);
        price.setUpdateTime(now);
        price.setDeleted(false);
        price.setTenantId(cycle.getTenantId());
        return price;
    }

    private static void restoreCycle(MarketQuoteCycleEntity cycle, MarketQuotePriceEntity previous) {
        LocalDateTime now = LocalDateTime.now();
        if (previous == null) {
            cycle.setPriceId(null);
            cycle.setPrice(null);
            cycle.setPriceIsTax(null);
            cycle.setPriceStatus(STATUS_TO_BE_QUOTED);
            cycle.setRefreshTime(null);
            cycle.setPriceUpdateTime(null);
        } else {
            cycle.setPriceId(previous.getId());
            cycle.setPrice(previous.getPrice());
            cycle.setPriceIsTax(previous.getPriceIsTax());
            cycle.setPriceStatus(previous.getStatus());
            cycle.setRefreshTime(previous.getCreateTime());
            cycle.setPriceUpdateTime(previous.getCreateTime());
        }
        cycle.setUpdateTime(now);
    }

    private static MarketQuoteItem toItem(MarketQuoteCycleEntity cycle, MarketQuotePriceEntity price,
                                          boolean haveTask) {
        MarketQuoteBusinessStatus status = businessStatus(cycle, price, haveTask);
        return new MarketQuoteItem(
                cycle.getId().toString(), cycle.getProductId().toString(), cycle.getProductCode(),
                cycle.getProductName(), cycle.getColorCode(), cycle.getColorName(),
                cycle.getColorGrade() == null ? "" : cycle.getColorGrade().toString(), cycle.getCertification(),
                price == null || price.getCreateTime() == null ? null : DATE_TIME.format(price.getCreateTime()),
                decimal(price == null ? null : price.getPriceIncludeTax()),
                decimal(price == null ? null : price.getPriceExcludeTax()), status.name(),
                price == null ? null : price.getRejectReason(), haveTask,
                status.canQuote(), status.canRevoke());
    }

    private static MarketQuoteBusinessStatus businessStatus(MarketQuoteCycleEntity cycle,
                                                            MarketQuotePriceEntity price,
                                                            boolean haveTask) {
        return MarketQuoteBusinessStatus.resolve(
                cycle.getPriceId() != null,
                cycle.getPriceStatus(),
                price == null ? null : price.getAuditResult(),
                haveTask);
    }

    private static Integer databaseStatus(String status) {
        if (status == null || status.isBlank() || "PENDING_QUOTE".equals(status)) {
            return null;
        }
        return switch (status) {
            case "PENDING_AUDIT" -> STATUS_PENDING_AUDIT;
            case "APPROVED" -> STATUS_APPROVED;
            case "REJECTED_VOID", "REQUOTE" -> STATUS_REJECTED;
            default -> throw new SupplierQuoteApiException(HttpStatus.BAD_REQUEST,
                    "MARKET_QUOTE_STATUS_INVALID", "报价状态不正确");
        };
    }

    private static YarnQualityStandards toStandards(YarnQualityStandardEntity standard) {
        return new YarnQualityStandards(
                metric(standard.getTwist(), " T/10cm"), metric(standard.getTwistCV(), "%"),
                metric(standard.getStrongCn(), " Cn"), metric(standard.getStrongCV(), "%"),
                metric(standard.getEvennessmust(), "%"), metric(standard.getCulars(), " 个/km"),
                metric(standard.getSlub(), " 个/km"), metric(standard.getNepsmust(), " 个/km"),
                metric(standard.getHairiness(), ""), metric(standard.getHeterocele(), " 根"));
    }

    private static String metric(Object value, String unit) {
        return value == null ? "-" : value + unit;
    }

    private static String decimal(BigDecimal value) {
        return value == null ? null : value.stripTrailingZeros().toPlainString();
    }

    private static MarketQuoteSubmissionResult success(List<MarketQuotePriceInput> items) {
        return new MarketQuoteSubmissionResult(items.stream().map(MarketQuotePriceInput::supcId).toList(), List.of());
    }

    private static Long numericId(String value, String name) {
        try {
            return Long.valueOf(value);
        } catch (RuntimeException exception) {
            throw new SupplierQuoteApiException(HttpStatus.BAD_REQUEST, "MARKET_QUOTE_ID_INVALID",
                    name + "ID不正确");
        }
    }

    private static String actor(BindingView binding) {
        return binding.accountId() == null || binding.accountId().isBlank()
                ? binding.supplierId() : binding.accountId();
    }

    private static SupplierQuoteApiException notFound(String message) {
        return new SupplierQuoteApiException(HttpStatus.NOT_FOUND, "MARKET_QUOTE_NOT_FOUND", message);
    }

    private static SupplierQuoteApiException conflict(String message) {
        return new SupplierQuoteApiException(HttpStatus.CONFLICT, "MARKET_QUOTE_STATE_CONFLICT", message);
    }
}
