package com.exceptioncoder.toolbox.claudechat.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** 只为版本化 Session Client REST 入口开放精确 Origin。 */
@Configuration
public class SessionClientCorsConfiguration implements WebMvcConfigurer {

    private final SessionClientProperties properties;

    public SessionClientCorsConfiguration(SessionClientProperties properties) {
        this.properties = properties;
    }

    /**
     * 注册公共 Client 的窄 CORS 边界。
     *
     * @param registry MVC CORS 注册表
     */
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        if (!properties.isEnabled() || properties.getAllowedOrigins().isEmpty()) {
            return;
        }
        registry.addMapping("/api/session-client/v1/**")
                .allowedOrigins(properties.getAllowedOrigins().toArray(String[]::new))
                .allowedMethods("GET", "POST", "OPTIONS")
                .allowedHeaders("Authorization", "Content-Type", "X-Request-Id")
                .allowCredentials(false)
                .maxAge(600);
    }
}
