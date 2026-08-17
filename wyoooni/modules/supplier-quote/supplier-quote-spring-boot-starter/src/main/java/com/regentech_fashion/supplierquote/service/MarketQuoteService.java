package com.regentech_fashion.supplierquote.service;

import com.regentech_fashion.supplierquote.api.SupplierQuoteApiException;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteBatchRequest;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuotePage;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuotePriceInput;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteQuery;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteSubmissionResult;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.YarnQualityStandards;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView;
import com.regentech_fashion.supplierquote.spi.MarketQuoteBackend;
import com.regentech_fashion.supplierquote.spi.MarketQuoteUseCase;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.Set;

/** 市场报价输入约束与远程调用编排。 */
public class MarketQuoteService implements MarketQuoteUseCase {
    private static final int MAX_PRICE_SCALE = 2;
    private final MarketQuoteBackend backend;

    public MarketQuoteService(MarketQuoteBackend backend) {
        this.backend = backend;
    }

    @Override
    public MarketQuotePage page(BindingView binding, MarketQuoteQuery query) {
        if (query.pageNo() < 1 || query.pageSize() < 1 || query.pageSize() > 100) {
            throw invalid("分页参数不正确");
        }
        if (!Set.of("PENDING", "ALL").contains(query.tab())) {
            throw invalid("报价页签不正确");
        }
        return backend.findPage(binding, query);
    }

    @Override
    public MarketQuoteSubmissionResult submit(BindingView binding, String supcId, MarketQuotePriceInput input,
                                              String idempotencyKey) {
        requireIdempotencyKey(idempotencyKey);
        if (!supcId.equals(input.supcId())) {
            throw invalid("报价记录与请求地址不一致");
        }
        validatePrice(input);
        return backend.submit(binding, input, idempotencyKey);
    }

    @Override
    public MarketQuoteSubmissionResult submitBatch(BindingView binding, MarketQuoteBatchRequest request,
                                                   String idempotencyKey) {
        requireIdempotencyKey(idempotencyKey);
        Set<String> uniqueIds = new HashSet<>((int) (request.items().size() / 0.75F) + 1);
        for (MarketQuotePriceInput input : request.items()) {
            if (!uniqueIds.add(input.supcId())) {
                throw invalid("批量报价不能包含重复记录");
            }
            validatePrice(input);
        }
        return backend.submitBatch(binding, request.items(), idempotencyKey);
    }

    @Override
    public void revoke(BindingView binding, String supcId) {
        backend.revoke(binding, supcId);
    }

    @Override
    public YarnQualityStandards qualityStandards(BindingView binding, String productId) {
        return backend.findQualityStandards(binding, productId);
    }

    private static void validatePrice(MarketQuotePriceInput input) {
        positivePrice(input.priceIncludeTax(), "含税价格");
        positivePrice(input.priceExcludeTax(), "不含税价格");
    }

    private static void positivePrice(String value, String label) {
        try {
            BigDecimal price = new BigDecimal(value);
            if (price.signum() <= 0 || price.scale() > MAX_PRICE_SCALE) {
                throw invalid(label + "必须大于0且最多两位小数");
            }
        } catch (NumberFormatException exception) {
            throw invalid(label + "格式不正确");
        }
    }

    private static void requireIdempotencyKey(String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw invalid("缺少幂等键");
        }
    }

    private static SupplierQuoteApiException invalid(String message) {
        return new SupplierQuoteApiException(HttpStatus.BAD_REQUEST, "MARKET_QUOTE_INVALID", message);
    }
}
