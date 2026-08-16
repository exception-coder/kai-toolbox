package com.regentech_fashion.supplierquote.domain;

import java.util.Optional;

public interface ScmCredentialVerifier {
    Optional<VerifiedScmAccount> verify(String username, String password);

    record VerifiedScmAccount(String userId, String username, String displayName,
                              String supplierId, String supplierName) {}
}
