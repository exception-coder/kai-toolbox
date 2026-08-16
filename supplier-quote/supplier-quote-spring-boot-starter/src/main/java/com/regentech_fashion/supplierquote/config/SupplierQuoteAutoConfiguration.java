package com.regentech_fashion.supplierquote.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.regentech_fashion.supplierquote.api.ScmBindingController;
import com.regentech_fashion.supplierquote.api.SupplierQuotationController;
import com.regentech_fashion.supplierquote.api.SupplierQuoteExceptionHandler;
import com.regentech_fashion.supplierquote.api.WechatIdentityController;
import com.regentech_fashion.supplierquote.domain.ScmCredentialVerifier;
import com.regentech_fashion.supplierquote.domain.WechatOAuthClient;
import com.regentech_fashion.supplierquote.infrastructure.ConfiguredScmCredentialVerifier;
import com.regentech_fashion.supplierquote.infrastructure.ConfiguredWechatOAuthClient;
import com.regentech_fashion.supplierquote.service.ScmBindingService;
import com.regentech_fashion.supplierquote.service.WechatIdentityService;
import com.regentech_fashion.supplierquote.spi.SupplierQuotationUseCase;
import com.regentech_fashion.supplierquote.spi.SupplierQuoteStore;
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
@Import({WechatIdentityController.class, ScmBindingController.class, SupplierQuotationController.class,
        SupplierQuoteExceptionHandler.class})
public class SupplierQuoteAutoConfiguration {
    /** 创建默认微信公众号 OAuth 客户端。 */
    @Bean
    @ConditionalOnMissingBean
    WechatOAuthClient wechatOAuthClient(SupplierQuoteProperties properties, ObjectMapper objectMapper) {
        return new ConfiguredWechatOAuthClient(properties, objectMapper);
    }

    /** 创建默认 SCM HTTP 凭证校验客户端。 */
    @Bean
    @ConditionalOnMissingBean
    ScmCredentialVerifier scmCredentialVerifier(SupplierQuoteProperties properties, ObjectMapper objectMapper) {
        return new ConfiguredScmCredentialVerifier(properties, objectMapper);
    }

    /** 创建微信身份编排服务。 */
    @Bean
    WechatIdentityService wechatIdentityService(SupplierQuoteStore store, WechatOAuthClient oauthClient,
                                                SupplierQuoteProperties properties) {
        return new WechatIdentityService(store, oauthClient, properties);
    }

    /** 创建 SCM 首次绑定服务。 */
    @Bean
    ScmBindingService scmBindingService(SupplierQuoteStore store, ScmCredentialVerifier verifier) {
        return new ScmBindingService(store, verifier);
    }
}
