package com.regentech_fashion.supplierquote.domain;

/** 供应商移动端市场报价的统一业务展示状态。 */
public enum MarketQuoteBusinessStatus {
    PENDING_QUOTE,
    PENDING_AUDIT,
    APPROVED,
    REJECTED_VOID,
    REQUOTE;

    private static final int STATUS_TO_BE_QUOTED = -1;
    private static final int STATUS_PENDING_AUDIT = 0;
    private static final int STATUS_APPROVED = 1;
    private static final int STATUS_REJECTED = 2;
    private static final int AUDIT_REJECTED = 2;
    private static final int AUDIT_RETURNED = 3;

    /**
     * 将 SRM 报价状态、审核结果和待办合并为供应商可理解的五态。
     *
     * @param quoteExists 是否已有报价记录
     * @param status SRM 报价状态
     * @param auditResult SRM 审核结果
     * @param haveTask 是否重新下发了报价待办
     */
    public static MarketQuoteBusinessStatus resolve(boolean quoteExists, Integer status,
                                                     Integer auditResult, boolean haveTask) {
        if (!quoteExists || status == null || status == STATUS_TO_BE_QUOTED) {
            return PENDING_QUOTE;
        }
        if (status == STATUS_PENDING_AUDIT) {
            return PENDING_AUDIT;
        }
        if (status == STATUS_APPROVED) {
            return APPROVED;
        }
        if (status == STATUS_REJECTED
                && (Integer.valueOf(AUDIT_RETURNED).equals(auditResult) || haveTask)) {
            return REQUOTE;
        }
        if (status == STATUS_REJECTED && Integer.valueOf(AUDIT_REJECTED).equals(auditResult)) {
            return REJECTED_VOID;
        }
        return status == STATUS_REJECTED ? REJECTED_VOID : PENDING_QUOTE;
    }

    public boolean canQuote() {
        return this == PENDING_QUOTE || this == REQUOTE;
    }

    public boolean canRevoke() {
        return this == PENDING_AUDIT;
    }
}
