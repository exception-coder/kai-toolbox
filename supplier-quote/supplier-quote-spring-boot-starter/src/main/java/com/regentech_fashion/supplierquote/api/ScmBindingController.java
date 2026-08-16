package com.regentech_fashion.supplierquote.api;

import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.ScmBindingRequest;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.ScmBindingResult;
import com.regentech_fashion.supplierquote.service.ScmBindingService;
import com.regentech_fashion.supplierquote.service.WechatIdentityService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/supplier-quote/public/scm-bindings")
public class ScmBindingController {
    private final WechatIdentityService identityService;
    private final ScmBindingService bindingService;

    public ScmBindingController(WechatIdentityService identityService, ScmBindingService bindingService) {
        this.identityService = identityService;
        this.bindingService = bindingService;
    }

    @PostMapping
    public ScmBindingResult bind(
            @CookieValue(name = WechatIdentityService.SESSION_COOKIE, required = false) String sessionToken,
            @Valid @RequestBody ScmBindingRequest request) {
        var session = identityService.requireSession(sessionToken);
        return bindingService.bind(session.subjectHash(), request);
    }
}
