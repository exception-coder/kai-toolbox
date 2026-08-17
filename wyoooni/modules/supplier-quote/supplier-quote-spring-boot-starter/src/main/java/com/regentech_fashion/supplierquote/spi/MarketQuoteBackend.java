package com.regentech_fashion.supplierquote.spi;

import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuotePage;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuotePriceInput;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteQuery;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteSubmissionResult;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.YarnQualityStandards;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView;

import java.util.List;

/** SRM 市场报价能力的宿主适配端口。 */
public interface MarketQuoteBackend {
    /** 查询当前供应商可见的报价分页。 */
    MarketQuotePage findPage(BindingView binding, MarketQuoteQuery query);

    /** 提交单条市场报价。 */
    MarketQuoteSubmissionResult submit(BindingView binding, MarketQuotePriceInput input, String idempotencyKey);

    /** 批量提交市场报价。 */
    MarketQuoteSubmissionResult submitBatch(BindingView binding, List<MarketQuotePriceInput> items,
                                             String idempotencyKey);

    /** 撤销当前供应商的一条待审核报价。 */
    void revoke(BindingView binding, String supcId);

    /** 查询当前供应商可见产品的质量标准。 */
    YarnQualityStandards findQualityStandards(BindingView binding, String productId);
}
