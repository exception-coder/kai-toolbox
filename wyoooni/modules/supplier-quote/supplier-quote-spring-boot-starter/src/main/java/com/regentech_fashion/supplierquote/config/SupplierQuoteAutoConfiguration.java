package com.regentech_fashion.supplierquote.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.regentech_fashion.supplierquote.api.BusinessAccountBindingController;
import com.regentech_fashion.supplierquote.api.MarketQuoteController;
import com.regentech_fashion.supplierquote.api.SupplierQuotationController;
import com.regentech_fashion.supplierquote.api.SupplierQuoteExceptionHandler;
import com.regentech_fashion.supplierquote.api.WechatIdentityController;
import com.regentech_fashion.supplierquote.api.WechatSubscriptionAdminController;
import com.regentech_fashion.supplierquote.domain.BusinessAccountVerifier;
import com.regentech_fashion.supplierquote.domain.WechatOAuthClient;
import com.regentech_fashion.supplierquote.domain.WechatSubscriptionClient;
import com.regentech_fashion.supplierquote.infrastructure.ConfiguredBusinessAccountVerifier;
import com.regentech_fashion.supplierquote.infrastructure.ConfiguredWechatOAuthClient;
import com.regentech_fashion.supplierquote.infrastructure.ConfiguredWechatSubscriptionClient;
import com.regentech_fashion.supplierquote.infrastructure.SrmMarketQuoteBackend;
import com.regentech_fashion.supplierquote.service.BusinessAccountBindingService;
import com.regentech_fashion.supplierquote.service.MarketQuoteService;
import com.regentech_fashion.supplierquote.service.WechatIdentityService;
import com.regentech_fashion.supplierquote.service.WechatSubscriptionService;
import com.regentech_fashion.supplierquote.spi.SupplierQuotationUseCase;
import com.regentech_fashion.supplierquote.spi.SupplierQuoteStore;
import com.regentech_fashion.supplierquote.spi.MarketQuoteBackend;
import com.regentech_fashion.supplierquote.spi.MarketQuoteUseCase;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

/**
 * 供应商报价 Starter 自动配置，不依赖宿主应用的根包扫描范围。
 */
@AutoConfiguration
@EnableConfigurationProperties(SupplierQuoteProperties.class)
@ConditionalOnBean({SupplierQuoteStore.class, SupplierQuotationUseCase.class})
@Import({WechatIdentityController.class, BusinessAccountBindingController.class, SupplierQuotationController.class,
        MarketQuoteController.class, WechatSubscriptionAdminController.class, SupplierQuoteExceptionHandler.class})
public class SupplierQuoteAutoConfiguration {
    /** 创建默认微信公众号 OAuth 客户端。 */
    @Bean
    @ConditionalOnMissingBean
    WechatOAuthClient wechatOAuthClient(SupplierQuoteProperties properties, ObjectMapper objectMapper) {
        return new ConfiguredWechatOAuthClient(properties, objectMapper);
    }

    /** 创建微信公众号一次性订阅消息客户端。 */
    @Bean
    @ConditionalOnMissingBean
    WechatSubscriptionClient wechatSubscriptionClient(SupplierQuoteProperties properties, ObjectMapper objectMapper) {
        return new ConfiguredWechatSubscriptionClient(properties, objectMapper);
    }

    /** 创建默认公司业务账号凭证校验客户端。 */
    @Bean
    @ConditionalOnMissingBean
    BusinessAccountVerifier businessAccountVerifier(SupplierQuoteProperties properties, ObjectMapper objectMapper) {
        return new ConfiguredBusinessAccountVerifier(properties, objectMapper);
    }

    /** 创建微信身份编排服务。 */
    @Bean
    WechatIdentityService wechatIdentityService(SupplierQuoteStore store, WechatOAuthClient oauthClient,
                                                SupplierQuoteProperties properties,
                                                WechatSubscriptionClient subscriptionClient) {
        return new WechatIdentityService(store, oauthClient, properties, subscriptionClient);
    }

    /** 创建一次性订阅机会管理与推送服务。 */
    @Bean
    WechatSubscriptionService wechatSubscriptionService(SupplierQuoteStore store,
                                                         WechatSubscriptionClient client,
                                                         SupplierQuoteProperties properties) {
        return new WechatSubscriptionService(store, client, properties);
    }

    /** 创建公司业务账号首次绑定服务。 */
    @Bean
    BusinessAccountBindingService businessAccountBindingService(SupplierQuoteStore store,
                                                                BusinessAccountVerifier verifier) {
        return new BusinessAccountBindingService(store, verifier);
    }

    /** 创建默认 SRM 市场报价远程适配器。 */
    @Bean
    @ConditionalOnMissingBean
    MarketQuoteBackend marketQuoteBackend(SupplierQuoteProperties properties, ObjectMapper objectMapper) {
        return new SrmMarketQuoteBackend(properties, objectMapper);
    }

    /** 创建市场报价输入校验与调用编排服务。 */
    @Bean
    MarketQuoteUseCase marketQuoteUseCase(MarketQuoteBackend backend) {
        return new MarketQuoteService(backend);
    }
}
