package com.regentech_fashion.supplierquote.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

/** 市场报价 H5 的精简传输契约。 */
public final class MarketQuoteDtos {
    private MarketQuoteDtos() {}

    /** 市场报价分页查询。 */
    public record MarketQuoteQuery(
            @Min(1) int pageNo,
            @Min(1) @Max(100) int pageSize,
            @NotBlank String tab,
            String productName,
            String status) {}

    /** 当前供应商可见的一条市场报价记录。 */
    public record MarketQuoteItem(
            String supcId,
            String productId,
            String productCode,
            String productName,
            String colorCode,
            String colorName,
            String colorGrade,
            String certification,
            String lastQuotedAt,
            String lastPriceIncludeTax,
            String lastPriceExcludeTax,
            String status,
            String auditReason,
            boolean haveTask,
            boolean canQuote,
            boolean canRevoke) {}

    /** 市场报价分页响应。 */
    public record MarketQuotePage(
            List<MarketQuoteItem> items,
            long total,
            long pendingCount,
            int pageNo,
            int pageSize) {}

    /** 单条价格输入，金额保持十进制字符串。 */
    public record MarketQuotePriceInput(
            String supcId,
            @NotBlank String priceIncludeTax,
            @NotBlank String priceExcludeTax) {}

    /** 批量市场报价请求。 */
    public record MarketQuoteBatchRequest(
            @NotEmpty List<@Valid MarketQuotePriceInput> items) {}

    /** 一条报价失败明细。 */
    public record MarketQuoteFailure(String supcId, String message) {}

    /** 单条或批量报价结果。 */
    public record MarketQuoteSubmissionResult(
            List<String> succeededIds,
            List<MarketQuoteFailure> failures) {}

    /** H5 展示的纱线质量指标。 */
    public record YarnQualityStandards(
            String twist,
            String twistCv,
            String strength,
            String strengthCv,
            String evennessCv,
            String thinPlaces,
            String thickPlaces,
            String neps,
            String hairinessIndex,
            String foreignFiberCount) {}
}
