package com.regentech_fashion.supplierquote.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public final class SupplierQuoteDtos {
    private SupplierQuoteDtos() {}

    public record BindingView(String accountId, String username, String displayName,
                              String supplierId, String supplierName, String sourceSystem) {}
    public record WechatSessionView(boolean authenticated, boolean bound, String authorizeUrl,
                                    BindingView binding) {}
    public record AccountBindingRequest(@NotBlank String username, @NotBlank String password, String returnTo) {}
    public record AccountBindingResult(BindingView binding, String returnTo) {}

    public record QuoteLineDraft(@NotBlank String itemId, @NotBlank String unitPrice,
                                 @NotBlank String taxRate, @NotNull Integer deliveryDays,
                                 @NotBlank String moq, String remark) {}
    public record QuoteItem(String itemId, String materialCode, String materialName,
                            String specification, String quantity, String unit, QuoteLineDraft draft) {}
    public record QuotationAccess(String quotationId, String requestNo, String title, String buyerName,
                                  String supplierName, String contactName, String status, boolean editable,
                                  String deadline, String currency, boolean taxIncluded, List<QuoteItem> items,
                                  String overallRemark, int draftVersion, String submittedAt,
                                  String erpSyncStatus) {}
    public record QuotationDraftRequest(@NotNull List<QuoteLineDraft> items, String overallRemark,
                                        String idempotencyKey, int draftVersion, Boolean confirmed) {}
    public record DraftReceipt(int draftVersion, String savedAt) {}
    public record SubmissionReceipt(String submissionId, String submittedAt, String requestNo,
                                    String erpSyncStatus) {}
}
