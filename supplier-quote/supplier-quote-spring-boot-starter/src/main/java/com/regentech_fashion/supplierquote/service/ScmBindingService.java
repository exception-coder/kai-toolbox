package com.regentech_fashion.supplierquote.service;

import com.regentech_fashion.supplierquote.api.SupplierQuoteApiException;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.ScmBindingRequest;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.ScmBindingResult;
import com.regentech_fashion.supplierquote.domain.ScmCredentialVerifier;
import com.regentech_fashion.supplierquote.spi.SupplierQuoteStore;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;

public class ScmBindingService {
    private final SupplierQuoteStore repository;
    private final ScmCredentialVerifier verifier;

    public ScmBindingService(SupplierQuoteStore repository, ScmCredentialVerifier verifier) {
        this.repository = repository;
        this.verifier = verifier;
    }

    @Transactional
    public ScmBindingResult bind(String subjectHash, ScmBindingRequest request) {
        BindingView existing = repository.findBindingBySubject(subjectHash).orElse(null);
        if (existing != null) {
            if (!existing.username().equalsIgnoreCase(request.username().trim())) {
                throw new SupplierQuoteApiException(HttpStatus.CONFLICT, "WECHAT_ALREADY_BOUND",
                        "当前微信已绑定其他 SCM 账号");
            }
            return new ScmBindingResult(existing, WechatIdentityService.safeReturnTo(request.returnTo()));
        }

        var verified = verifier.verify(request.username().trim(), request.password())
                .orElseThrow(() -> new SupplierQuoteApiException(HttpStatus.UNAUTHORIZED,
                        "SCM_CREDENTIALS_INVALID", "SCM 账号或密码不正确"));
        var accountOwner = repository.findBindingByScmUser(verified.userId());
        if (accountOwner.isPresent() && !accountOwner.get().subjectHash().equals(subjectHash)) {
            throw new SupplierQuoteApiException(HttpStatus.CONFLICT, "SCM_ACCOUNT_ALREADY_BOUND",
                    "该 SCM 账号已绑定其他微信，请联系管理员处理");
        }
        BindingView binding = new BindingView(verified.userId(), verified.username(), verified.displayName(),
                verified.supplierId(), verified.supplierName());
        try {
            repository.insertBinding(subjectHash, binding, System.currentTimeMillis());
        } catch (DataIntegrityViolationException exception) {
            throw new SupplierQuoteApiException(HttpStatus.CONFLICT, "BINDING_CONFLICT",
                    "账号绑定状态已变化，请刷新后重试");
        }
        return new ScmBindingResult(binding, WechatIdentityService.safeReturnTo(request.returnTo()));
    }
}
