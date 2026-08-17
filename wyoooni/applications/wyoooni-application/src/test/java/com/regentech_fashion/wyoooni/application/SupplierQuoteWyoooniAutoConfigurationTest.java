package com.regentech_fashion.wyoooni.application.supplierquote;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.regentech_fashion.supplierquote.api.BusinessAccountBindingController;
import com.regentech_fashion.supplierquote.config.SupplierQuoteAutoConfiguration;
import com.regentech_fashion.wyoooni.enterprise.application.gateway.EnterpriseGateway;
import com.regentech_fashion.wyoooni.enterprise.domain.identity.EnterpriseAccountBinding;
import com.regentech_fashion.wyoooni.enterprise.domain.identity.AccountBindingStore;
import com.regentech_fashion.wyoooni.enterprise.domain.identity.OauthStateStore;
import com.regentech_fashion.wyoooni.enterprise.domain.identity.WechatSessionStore;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

class SupplierQuoteWyoooniAutoConfigurationTest {
    @Test
    void connectsEnterpriseFoundationToSupplierQuoteStarter() {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(
                        SupplierQuoteWyoooniAutoConfiguration.class, SupplierQuoteAutoConfiguration.class))
                .withPropertyValues("regentech.supplier-quote.wyoooni.enabled=true")
                .withBean(ObjectMapper.class, ObjectMapper::new)
                .withBean(EnterpriseGateway.class, () -> mock(EnterpriseGateway.class))
                .withBean(OauthStateStore.class, NoopOauthStateStore::new)
                .withBean(WechatSessionStore.class, NoopWechatSessionStore::new)
                .withBean(AccountBindingStore.class, NoopAccountBindingStore::new)
                .run(context -> {
                    assertEquals(1, context.getBeansOfType(EnterpriseGateway.class).size());
                    assertTrue(context.containsBean("wyoooniSupplierQuotationService"));
                    assertEquals(1, context.getBeansOfType(BusinessAccountBindingController.class).size());
                });
    }

    private static class NoopOauthStateStore implements OauthStateStore {
        @Override public void save(String stateHash, String returnTo, long expiresAt, long now) {}
        @Override public Optional<String> consume(String stateHash, long now) {
            return Optional.empty();
        }
    }

    private static class NoopWechatSessionStore implements WechatSessionStore {
        @Override public void save(String tokenHash, String subjectHash, long expiresAt, long now) {}
        @Override public Optional<WechatSession> find(String tokenHash, long now) {
            return Optional.empty();
        }
    }

    private static class NoopAccountBindingStore implements AccountBindingStore {
        @Override public Optional<EnterpriseAccountBinding> findBySubject(String subjectHash) {
            return Optional.empty();
        }
        @Override public Optional<BindingOwner> findByAccount(
                String accountId, String sourceSystem) {
            return Optional.empty();
        }
        @Override public EnterpriseAccountBinding insert(
                String subjectHash, EnterpriseAccountBinding binding, long now) {
            return binding;
        }
    }
}
