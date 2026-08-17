package com.regentech_fashion.supplierquote.api;

import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteBatchRequest;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuotePage;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuotePriceInput;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteQuery;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.MarketQuoteSubmissionResult;
import com.regentech_fashion.supplierquote.api.dto.MarketQuoteDtos.YarnQualityStandards;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView;
import com.regentech_fashion.supplierquote.service.WechatIdentityService;
import com.regentech_fashion.supplierquote.spi.MarketQuoteUseCase;
import com.regentech_fashion.supplierquote.spi.SupplierQuotationUseCase;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 供应商移动端市场报价接口。 */
@RestController
@RequestMapping("/api/supplier-quote/admin/h5/market-price-quotes")
public class MarketQuoteController {
    private final WechatIdentityService identityService;
    private final SupplierQuotationUseCase quotationUseCase;
    private final MarketQuoteUseCase marketQuoteUseCase;

    public MarketQuoteController(WechatIdentityService identityService,
                                 SupplierQuotationUseCase quotationUseCase,
                                 MarketQuoteUseCase marketQuoteUseCase) {
        this.identityService = identityService;
        this.quotationUseCase = quotationUseCase;
        this.marketQuoteUseCase = marketQuoteUseCase;
    }

    /** 查询当前绑定供应商的市场报价。 */
    @GetMapping
    public MarketQuotePage page(
            @CookieValue(name = WechatIdentityService.SESSION_COOKIE, required = false) String sessionToken,
            @RequestParam(defaultValue = "1") int pageNo,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(defaultValue = "PENDING") String tab,
            @RequestParam(defaultValue = "") String productName,
            @RequestParam(defaultValue = "") String status) {
        return marketQuoteUseCase.page(binding(sessionToken),
                new MarketQuoteQuery(pageNo, pageSize, tab, productName, status));
    }

    /** 提交单条市场报价。 */
    @PostMapping("/{supcId}/submit")
    public MarketQuoteSubmissionResult submit(
            @CookieValue(name = WechatIdentityService.SESSION_COOKIE, required = false) String sessionToken,
            @PathVariable String supcId,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody MarketQuotePriceInput input) {
        return marketQuoteUseCase.submit(binding(sessionToken), supcId, input, idempotencyKey);
    }

    /** 批量提交市场报价。 */
    @PostMapping("/batch-submit")
    public MarketQuoteSubmissionResult submitBatch(
            @CookieValue(name = WechatIdentityService.SESSION_COOKIE, required = false) String sessionToken,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody MarketQuoteBatchRequest request) {
        return marketQuoteUseCase.submitBatch(binding(sessionToken), request, idempotencyKey);
    }

    /** 撤销当前供应商的待审核报价。 */
    @PutMapping("/{supcId}/revoke")
    public ResponseEntity<Void> revoke(
            @CookieValue(name = WechatIdentityService.SESSION_COOKIE, required = false) String sessionToken,
            @PathVariable String supcId) {
        marketQuoteUseCase.revoke(binding(sessionToken), supcId);
        return ResponseEntity.noContent().build();
    }

    /** 查询当前供应商可见产品的质量标准。 */
    @GetMapping("/products/{productId}/quality-standards")
    public YarnQualityStandards qualityStandards(
            @CookieValue(name = WechatIdentityService.SESSION_COOKIE, required = false) String sessionToken,
            @PathVariable String productId) {
        return marketQuoteUseCase.qualityStandards(binding(sessionToken), productId);
    }

    private BindingView binding(String sessionToken) {
        var session = identityService.requireSession(sessionToken);
        return quotationUseCase.requireBinding(session.subjectHash());
    }
}
