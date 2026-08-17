package com.regentech_fashion.supplierquote.domain;

import java.util.Optional;

/**
 * 公司统一业务账号校验端口。账号可以来自 ERP、SCM、SRM 或其他业务系统。
 */
public interface BusinessAccountVerifier {
    Optional<VerifiedBusinessAccount> verify(String username, String password);

    record VerifiedBusinessAccount(String accountId, String username, String displayName,
                                   String supplierId, String supplierName, String sourceSystem) {}
}
