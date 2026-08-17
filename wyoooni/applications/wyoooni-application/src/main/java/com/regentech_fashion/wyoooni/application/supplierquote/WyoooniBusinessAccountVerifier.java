package com.regentech_fashion.wyoooni.application.supplierquote;

import com.regentech_fashion.supplierquote.domain.BusinessAccountVerifier;
import com.regentech_fashion.wyoooni.enterprise.application.gateway.EnterpriseGateway;

import java.util.Optional;

/** 使用 Wyoooni 企业网关校验供应商报价登录账号。 */
public class WyoooniBusinessAccountVerifier implements BusinessAccountVerifier {
    private final EnterpriseGateway gatewayClient;

    public WyoooniBusinessAccountVerifier(EnterpriseGateway gatewayClient) {
        this.gatewayClient = gatewayClient;
    }

    @Override
    public Optional<VerifiedBusinessAccount> verify(String username, String password) {
        return WyoooniSupplierQuoteExceptionMapper.call(() -> gatewayClient.verifyAccount(username, password))
                .map(account -> new VerifiedBusinessAccount(account.accountId(), account.username(),
                        account.displayName(), account.businessPartyId(), account.businessPartyName(),
                        account.sourceSystem()));
    }
}
