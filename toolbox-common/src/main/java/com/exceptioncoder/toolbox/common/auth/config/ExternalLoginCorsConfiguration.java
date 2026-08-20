package com.exceptioncoder.toolbox.common.auth.config;

import jakarta.servlet.DispatcherType;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.net.URI;
import java.util.List;

/**
 * 为 Forge 外部账号登录注册最小范围的 CORS 过滤器。
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "toolbox.auth.external-login", name = "enabled", havingValue = "true")
public class ExternalLoginCorsConfiguration {

    private static final String LOGIN_PATH = "/api/auth/external-login";

    /**
     * 创建只覆盖登录路径的 CORS 过滤器，拒绝通配符和非标准 Origin。
     *
     * @param properties 认证配置
     * @return 登录 CORS 过滤器注册对象
     */
    @Bean
    public FilterRegistrationBean<CorsFilter> externalLoginCorsFilter(AuthProperties properties) {
        List<String> allowedOrigins = normalizeOrigins(properties.getExternalLogin().getAllowedOrigins());
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(allowedOrigins);
        cors.setAllowedMethods(List.of("POST", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Content-Type"));
        cors.setAllowCredentials(false);
        cors.setMaxAge(600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration(LOGIN_PATH, cors);

        FilterRegistrationBean<CorsFilter> registration = new FilterRegistrationBean<>(new CorsFilter(source));
        registration.setName("authExternalLoginCorsFilter");
        registration.addUrlPatterns(LOGIN_PATH);
        registration.setDispatcherTypes(DispatcherType.REQUEST);
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 5);
        return registration;
    }

    private List<String> normalizeOrigins(List<String> configuredOrigins) {
        return configuredOrigins.stream()
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .distinct()
                .map(this::validateOrigin)
                .toList();
    }

    private String validateOrigin(String origin) {
        if (origin.contains("*")) {
            throw new IllegalArgumentException("外部登录 Origin 禁止使用通配符: " + origin);
        }
        URI uri;
        try {
            uri = URI.create(origin);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("外部登录 Origin 格式无效: " + origin, exception);
        }
        boolean supportedScheme = "http".equalsIgnoreCase(uri.getScheme())
                || "https".equalsIgnoreCase(uri.getScheme());
        boolean hasOnlyOriginParts = uri.getHost() != null
                && (uri.getPath() == null || uri.getPath().isEmpty())
                && uri.getRawQuery() == null
                && uri.getRawFragment() == null
                && uri.getRawUserInfo() == null;
        if (!supportedScheme || !hasOnlyOriginParts) {
            throw new IllegalArgumentException("外部登录必须配置完整且无路径的 HTTP(S) Origin: " + origin);
        }
        return origin;
    }
}
