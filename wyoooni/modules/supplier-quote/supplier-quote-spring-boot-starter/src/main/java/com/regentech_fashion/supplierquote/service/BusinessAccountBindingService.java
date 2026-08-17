package com.regentech_fashion.supplierquote.service;

import com.regentech_fashion.supplierquote.api.SupplierQuoteApiException;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.AccountBindingRequest;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.AccountBindingResult;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView;
import com.regentech_fashion.supplierquote.domain.BusinessAccountVerifier;
import com.regentech_fashion.supplierquote.spi.SupplierQuoteStore;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;

public class BusinessAccountBindingService {
    private final SupplierQuoteStore store;
    private final BusinessAccountVerifier verifier;

    public BusinessAccountBindingService(SupplierQuoteStore store, BusinessAccountVerifier verifier) {
        this.store = store;
        this.verifier = verifier;
    }

    @Transactional
    public AccountBindingResult bind(String subjectHash, AccountBindingRequest request) {
        BindingView existing = store.findBindingBySubject(subjectHash).orElse(null);
        if (existing != null) {
            if (!existing.username().equalsIgnoreCase(request.username().trim())) {
                throw new SupplierQuoteApiException(HttpStatus.CONFLICT, "WECHAT_ALREADY_BOUND",
                        "当前微信已绑定其他业务账号");
            }
            return result(existing, request.returnTo());
        }

        var verified = verifier.verify(request.username().trim(), request.password())
                .orElseThrow(() -> new SupplierQuoteApiException(HttpStatus.UNAUTHORIZED,
                        "BUSINESS_CREDENTIALS_INVALID", "业务账号或密码不正确"));
        var accountOwner = store.findBindingByAccount(verified.accountId(), verified.sourceSystem());
        if (accountOwner.isPresent() && !accountOwner.get().subjectHash().equals(subjectHash)) {
            throw new SupplierQuoteApiException(HttpStatus.CONFLICT, "BUSINESS_ACCOUNT_ALREADY_BOUND",
                    "该业务账号已绑定其他微信，请联系管理员处理");
        }
        BindingView binding = new BindingView(verified.accountId(), verified.username(), verified.displayName(),
                verified.supplierId(), verified.supplierName(), verified.sourceSystem());
        try {
            store.insertBinding(subjectHash, binding, System.currentTimeMillis());
        } catch (DataIntegrityViolationException exception) {
            throw new SupplierQuoteApiException(HttpStatus.CONFLICT, "BINDING_CONFLICT",
                    "账号绑定状态已变化，请刷新后重试");
        }
        return result(binding, request.returnTo());
    }

    private static AccountBindingResult result(BindingView binding, String returnTo) {
        return new AccountBindingResult(binding, WechatIdentityService.safeReturnTo(returnTo));
    }
}
