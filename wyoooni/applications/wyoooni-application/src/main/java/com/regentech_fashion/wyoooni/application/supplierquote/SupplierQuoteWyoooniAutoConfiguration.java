package com.regentech_fashion.wyoooni.application.supplierquote;

import com.regentech_fashion.supplierquote.config.SupplierQuoteAutoConfiguration;
import com.regentech_fashion.supplierquote.domain.BusinessAccountVerifier;
import com.regentech_fashion.supplierquote.spi.SupplierQuotationUseCase;
import com.regentech_fashion.supplierquote.spi.SupplierQuoteStore;
import com.regentech_fashion.wyoooni.enterprise.application.gateway.EnterpriseGateway;
import com.regentech_fashion.wyoooni.enterprise.config.WyoooniEnterpriseAutoConfiguration;
import com.regentech_fashion.wyoooni.enterprise.domain.identity.AccountBindingStore;
import com.regentech_fashion.wyoooni.enterprise.domain.identity.OauthStateStore;
import com.regentech_fashion.wyoooni.enterprise.domain.identity.WechatSessionStore;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigureAfter;
import org.springframework.boot.autoconfigure.AutoConfigureBefore;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

/** 供应商报价的 Wyoooni 生产薄适配器自动配置。 */
@AutoConfiguration
@AutoConfigureAfter(WyoooniEnterpriseAutoConfiguration.class)
@AutoConfigureBefore(SupplierQuoteAutoConfiguration.class)
@EnableConfigurationProperties(SupplierQuoteWyoooniProperties.class)
@ConditionalOnBean({OauthStateStore.class, WechatSessionStore.class, AccountBindingStore.class,
        EnterpriseGateway.class})
@ConditionalOnProperty(prefix = "regentech.supplier-quote.wyoooni", name = "enabled", havingValue = "true")
public class SupplierQuoteWyoooniAutoConfiguration {
    /** 将公司级身份存储适配为报价 Store。 */
    @Bean
    @ConditionalOnMissingBean(SupplierQuoteStore.class)
    SupplierQuoteStore wyoooniSupplierQuoteStore(OauthStateStore oauthStateStore,
                                                  WechatSessionStore wechatSessionStore,
                                                  AccountBindingStore accountBindingStore) {
        return new WyoooniSupplierQuoteStore(oauthStateStore, wechatSessionStore, accountBindingStore);
    }

    /** 将公司统一账号校验适配为报价账号校验。 */
    @Bean
    @ConditionalOnMissingBean(BusinessAccountVerifier.class)
    BusinessAccountVerifier wyoooniBusinessAccountVerifier(EnterpriseGateway gatewayClient) {
        return new WyoooniBusinessAccountVerifier(gatewayClient);
    }

    /** 将公司统一业务网关适配为报价读写用例。 */
    @Bean
    @ConditionalOnMissingBean(SupplierQuotationUseCase.class)
    SupplierQuotationUseCase wyoooniSupplierQuotationService(SupplierQuoteWyoooniProperties properties,
                                                              EnterpriseGateway gatewayClient,
                                                              SupplierQuoteStore store) {
        return new WyoooniSupplierQuotationService(properties, gatewayClient, store);
    }
}
