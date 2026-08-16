package com.regentech_fashion.supplierquote.api;

import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.DraftReceipt;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.QuotationAccess;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.QuotationDraftRequest;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.SubmissionReceipt;
import com.regentech_fashion.supplierquote.service.WechatIdentityService;
import com.regentech_fashion.supplierquote.spi.SupplierQuotationUseCase;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/supplier-quote/public/quotation-access")
public class SupplierQuotationController {
    private final WechatIdentityService identityService;
    private final SupplierQuotationUseCase quotationService;

    public SupplierQuotationController(WechatIdentityService identityService,
                                       SupplierQuotationUseCase quotationService) {
        this.identityService = identityService;
        this.quotationService = quotationService;
    }

    @GetMapping("/{ticket}")
    public QuotationAccess access(@PathVariable String ticket,
            @CookieValue(name = WechatIdentityService.SESSION_COOKIE, required = false) String sessionToken) {
        return quotationService.access(ticket, binding(sessionToken));
    }

    @PutMapping("/{ticket}/draft")
    public DraftReceipt saveDraft(@PathVariable String ticket,
            @CookieValue(name = WechatIdentityService.SESSION_COOKIE, required = false) String sessionToken,
            @Valid @RequestBody QuotationDraftRequest request) {
        return quotationService.saveDraft(ticket, binding(sessionToken), request);
    }

    @PostMapping("/{ticket}/submit")
    public SubmissionReceipt submit(@PathVariable String ticket,
            @CookieValue(name = WechatIdentityService.SESSION_COOKIE, required = false) String sessionToken,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody QuotationDraftRequest request) {
        return quotationService.submit(ticket, binding(sessionToken), idempotencyKey, request);
    }

    private com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView binding(String token) {
        var session = identityService.requireSession(token);
        return quotationService.requireBinding(session.subjectHash());
    }
}
