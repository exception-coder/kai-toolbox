package com.exceptioncoder.toolbox.claudechat.config;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SessionClientCorsConfigurationTest {

    @Test
    @SuppressWarnings("unchecked")
    void registersOnlyTheConfiguredOriginAndPublicClientPath() {
        SessionClientProperties properties = new SessionClientProperties();
        properties.setAllowedOrigins(List.of("https://business.example.internal", ""));
        CorsRegistry registry = new CorsRegistry();

        new SessionClientCorsConfiguration(properties).addCorsMappings(registry);

        Map<String, CorsConfiguration> mappings = (Map<String, CorsConfiguration>)
                ReflectionTestUtils.invokeMethod(registry, "getCorsConfigurations");
        assertThat(mappings).containsOnlyKeys("/api/session-client/v1/**");
        CorsConfiguration cors = mappings.get("/api/session-client/v1/**");
        assertThat(cors.getAllowedOrigins()).containsExactly("https://business.example.internal");
        assertThat(cors.getAllowedMethods()).containsExactly("GET", "POST", "OPTIONS");
        assertThat(cors.getAllowedHeaders()).containsExactly("Authorization", "Content-Type", "X-Request-Id");
        assertThat(cors.getAllowCredentials()).isFalse();
    }

    @Test
    @SuppressWarnings("unchecked")
    void emptyOriginListDoesNotCreateAWildcardMapping() {
        CorsRegistry registry = new CorsRegistry();

        new SessionClientCorsConfiguration(new SessionClientProperties()).addCorsMappings(registry);

        Map<String, CorsConfiguration> mappings = (Map<String, CorsConfiguration>)
                ReflectionTestUtils.invokeMethod(registry, "getCorsConfigurations");
        assertThat(mappings).isEmpty();
    }
}
