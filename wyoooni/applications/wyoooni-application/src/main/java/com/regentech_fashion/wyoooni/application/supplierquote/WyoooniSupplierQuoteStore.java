package com.regentech_fashion.wyoooni.application.supplierquote;

import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.BindingView;
import com.regentech_fashion.supplierquote.spi.SupplierQuoteStore;
import com.regentech_fashion.wyoooni.enterprise.domain.identity.EnterpriseAccountBinding;
import com.regentech_fashion.wyoooni.enterprise.domain.identity.AccountBindingStore;
import com.regentech_fashion.wyoooni.enterprise.domain.identity.OauthStateStore;
import com.regentech_fashion.wyoooni.enterprise.domain.identity.WechatSessionStore;

import java.util.Optional;

/** 将 Wyoooni 企业身份存储映射为供应商报价身份存储端口。 */
public class WyoooniSupplierQuoteStore implements SupplierQuoteStore {
    private final OauthStateStore oauthStateStore;
    private final WechatSessionStore wechatSessionStore;
    private final AccountBindingStore accountBindingStore;

    public WyoooniSupplierQuoteStore(OauthStateStore oauthStateStore, WechatSessionStore wechatSessionStore,
                                     AccountBindingStore accountBindingStore) {
        this.oauthStateStore = oauthStateStore;
        this.wechatSessionStore = wechatSessionStore;
        this.accountBindingStore = accountBindingStore;
    }

    @Override
    public void saveOauthState(String stateHash, String returnTo, long expiresAt, long now) {
        oauthStateStore.save(stateHash, returnTo, expiresAt, now);
    }

    @Override
    public Optional<String> consumeOauthState(String stateHash, long now) {
        return oauthStateStore.consume(stateHash, now);
    }

    @Override
    public void saveSession(String tokenHash, String subjectHash, long expiresAt, long now) {
        wechatSessionStore.save(tokenHash, subjectHash, expiresAt, now);
    }

    @Override
    public Optional<WechatSessionRecord> findSession(String tokenHash, long now) {
        return wechatSessionStore.find(tokenHash, now)
                .map(session -> new WechatSessionRecord(session.subjectHash(), session.expiresAt()));
    }

    @Override
    public Optional<BindingView> findBindingBySubject(String subjectHash) {
        return accountBindingStore.findBySubject(subjectHash).map(WyoooniSupplierQuoteStore::toBindingView);
    }

    @Override
    public Optional<BindingSubjectRecord> findBindingByAccount(String accountId, String sourceSystem) {
        return accountBindingStore.findByAccount(accountId, sourceSystem)
                .map(owner -> new BindingSubjectRecord(
                        owner.subjectHash(), owner.accountId(), owner.sourceSystem()));
    }

    @Override
    public BindingView insertBinding(String subjectHash, BindingView binding, long now) {
        accountBindingStore.insert(subjectHash, toEnterpriseBinding(binding), now);
        return binding;
    }

    private static BindingView toBindingView(EnterpriseAccountBinding binding) {
        return new BindingView(binding.accountId(), binding.username(), binding.displayName(),
                binding.businessPartyId(), binding.businessPartyName(), binding.sourceSystem());
    }

    private static EnterpriseAccountBinding toEnterpriseBinding(BindingView binding) {
        return new EnterpriseAccountBinding(binding.accountId(), binding.username(), binding.displayName(),
                binding.supplierId(), binding.supplierName(), binding.sourceSystem());
    }
}
