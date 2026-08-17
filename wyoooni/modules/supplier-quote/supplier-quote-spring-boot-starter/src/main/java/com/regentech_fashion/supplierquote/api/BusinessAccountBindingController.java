package com.regentech_fashion.supplierquote.api;

import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.AccountBindingRequest;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.AccountBindingResult;
import com.regentech_fashion.supplierquote.service.BusinessAccountBindingService;
import com.regentech_fashion.supplierquote.service.WechatIdentityService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({"/api/supplier-quote/public/account-bindings", "/api/supplier-quote/public/scm-bindings"})
public class BusinessAccountBindingController {
    private final WechatIdentityService identityService;
    private final BusinessAccountBindingService bindingService;

    public BusinessAccountBindingController(WechatIdentityService identityService,
                                            BusinessAccountBindingService bindingService) {
        this.identityService = identityService;
        this.bindingService = bindingService;
    }

    @PostMapping
    public AccountBindingResult bind(
            @CookieValue(name = WechatIdentityService.SESSION_COOKIE, required = false) String sessionToken,
            @Valid @RequestBody AccountBindingRequest request) {
        var session = identityService.requireSession(sessionToken);
        return bindingService.bind(session.subjectHash(), request);
    }
}
