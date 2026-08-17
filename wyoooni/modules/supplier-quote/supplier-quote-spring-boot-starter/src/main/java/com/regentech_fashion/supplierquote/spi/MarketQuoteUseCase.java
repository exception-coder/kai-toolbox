package com.regentech_fashion.supplierquote.spi;

import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteBatchRequest;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuotePage;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuotePriceInput;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteQuery;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteSubmissionResult;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.YarnQualityStandards;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView;

/** H5 市场报价应用用例。 */
public interface MarketQuoteUseCase {
    /** 查询市场报价分页。 */
    MarketQuotePage page(BindingView binding, MarketQuoteQuery query);

    /** 提交单条报价。 */
    MarketQuoteSubmissionResult submit(BindingView binding, String supcId, MarketQuotePriceInput input,
                                       String idempotencyKey);

    /** 批量提交报价。 */
    MarketQuoteSubmissionResult submitBatch(BindingView binding, MarketQuoteBatchRequest request,
                                            String idempotencyKey);

    /** 撤销待审核报价。 */
    void revoke(BindingView binding, String supcId);

    /** 查询纱线质量标准。 */
    YarnQualityStandards qualityStandards(BindingView binding, String productId);
}
