package com.regentech_fashion.supplierquote.service;

import com.regentech_fashion.supplierquote.api.SupplierQuoteApiException;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.AccountBindingRequest;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.AccountBindingResult;
import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView;
import com.regentech_fashion.supplierquote.domain.BusinessAccountVerifier;
import com.regentech_fashion.supplierquote.spi.SupplierQuoteStore;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;

import java.util.concurrent.locks.LockSupport;

public class BusinessAccountBindingService {
    private final SupplierQuoteStore store;
    private final BusinessAccountVerifier verifier;

    public BusinessAccountBindingService(SupplierQuoteStore store, BusinessAccountVerifier verifier) {
        this.store = store;
        this.verifier = verifier;
    }

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
        insertBinding(subjectHash, binding);
        return result(binding, request.returnTo());
    }

    private void insertBinding(String subjectHash, BindingView binding) {
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                store.insertBinding(subjectHash, binding, System.currentTimeMillis());
                return;
            } catch (DataIntegrityViolationException exception) {
                throw new SupplierQuoteApiException(HttpStatus.CONFLICT, "BINDING_CONFLICT",
                        "账号绑定状态已变化，请刷新后重试");
            } catch (DataAccessException exception) {
                if (!isSqliteBusy(exception) || attempt == 1) {
                    throw new SupplierQuoteApiException(HttpStatus.SERVICE_UNAVAILABLE, "BINDING_STORAGE_BUSY",
                            "账号绑定服务正在处理其他请求，请稍后重试");
                }
                LockSupport.parkNanos(50_000_000L);
            }
        }
    }

    private static boolean isSqliteBusy(Throwable exception) {
        Throwable current = exception;
        while (current != null) {
            String message = current.getMessage();
            if (message != null && (message.contains("SQLITE_BUSY") || message.contains("database is locked"))) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private static AccountBindingResult result(BindingView binding, String returnTo) {
        return new AccountBindingResult(binding, WechatIdentityService.safeReturnTo(returnTo));
    }
}
