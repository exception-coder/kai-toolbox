package com.regentech_fashion.wyoooni.enterprise.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.regentech_fashion.wyoooni.enterprise.application.gateway.EnterpriseGateway;
import com.regentech_fashion.wyoooni.enterprise.domain.identity.AccountBindingStore;
import com.regentech_fashion.wyoooni.enterprise.domain.identity.OauthStateStore;
import com.regentech_fashion.wyoooni.enterprise.domain.identity.WechatSessionStore;
import com.regentech_fashion.wyoooni.enterprise.infrastructure.gateway.WyoooniEnterpriseGatewayClient;
import com.regentech_fashion.wyoooni.enterprise.infrastructure.persistence.jpa.JpaPersistenceMarker;
import com.regentech_fashion.wyoooni.enterprise.infrastructure.persistence.jpa.binding.AccountBindingJpaRepository;
import com.regentech_fashion.wyoooni.enterprise.infrastructure.persistence.jpa.binding.JpaAccountBindingStore;
import com.regentech_fashion.wyoooni.enterprise.infrastructure.persistence.jpa.oauth.JpaOauthStateStore;
import com.regentech_fashion.wyoooni.enterprise.infrastructure.persistence.jpa.oauth.OauthStateJpaRepository;
import com.regentech_fashion.wyoooni.enterprise.infrastructure.persistence.jpa.session.JpaWechatSessionStore;
import com.regentech_fashion.wyoooni.enterprise.infrastructure.persistence.jpa.session.WechatSessionJpaRepository;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/** Wyoooni 企业通用能力自动配置。 */
@AutoConfiguration
@EnableConfigurationProperties(WyoooniEnterpriseProperties.class)
@EntityScan(basePackageClasses = JpaPersistenceMarker.class)
@EnableJpaRepositories(basePackageClasses = JpaPersistenceMarker.class)
@ConditionalOnProperty(prefix = "regentech.wyoooni.enterprise", name = "enabled", havingValue = "true")
public class WyoooniEnterpriseAutoConfiguration {
    /** 创建宿主数据库上的 OAuth state 存储。 */
    @Bean
    @ConditionalOnMissingBean(OauthStateStore.class)
    OauthStateStore oauthStateStore(OauthStateJpaRepository repository) {
        return new JpaOauthStateStore(repository);
    }

    /** 创建宿主数据库上的微信会话存储。 */
    @Bean
    @ConditionalOnMissingBean(WechatSessionStore.class)
    WechatSessionStore wechatSessionStore(WechatSessionJpaRepository repository) {
        return new JpaWechatSessionStore(repository);
    }

    /** 创建宿主数据库上的企业账号绑定存储。 */
    @Bean
    @ConditionalOnMissingBean(AccountBindingStore.class)
    AccountBindingStore accountBindingStore(AccountBindingJpaRepository repository) {
        return new JpaAccountBindingStore(repository);
    }

    /** 创建公司统一业务网关客户端。 */
    @Bean
    @ConditionalOnMissingBean(EnterpriseGateway.class)
    EnterpriseGateway enterpriseGateway(
            WyoooniEnterpriseProperties properties, ObjectMapper objectMapper) {
        return new WyoooniEnterpriseGatewayClient(properties, objectMapper);
    }
}
