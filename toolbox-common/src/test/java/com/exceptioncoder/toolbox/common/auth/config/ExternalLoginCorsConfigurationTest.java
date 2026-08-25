package com.exceptioncoder.toolbox.common.auth.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.filter.CorsFilter;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 外部 Forge 登录 CORS 白名单测试。
 */
class ExternalLoginCorsConfigurationTest {

    private static final String ALLOWED_ORIGIN = "https://erp-test.example.com";

    @Test
    void allowsConfiguredOriginForLoginPreflight() throws Exception {
        MockMvc mvc = mockMvc(List.of(ALLOWED_ORIGIN));

        mvc.perform(options("/api/auth/external-login")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "Content-Type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", ALLOWED_ORIGIN))
                .andExpect(header().string("Access-Control-Allow-Methods", "POST,OPTIONS"));
    }

    @Test
    void rejectsOriginOutsideWhitelist() throws Exception {
        MockMvc mvc = mockMvc(List.of(ALLOWED_ORIGIN));

        mvc.perform(options("/api/auth/external-login")
                        .header("Origin", "https://unknown.example.com")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    void allowsConfiguredOriginAndAuthorizationHeaderForAttachmentUpload() throws Exception {
        MockMvc mvc = mockMvc(List.of(ALLOWED_ORIGIN));

        mvc.perform(options("/api/claude-chat/sessions/session-1/attachments")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "Authorization,Content-Type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", ALLOWED_ORIGIN))
                .andExpect(header().string("Access-Control-Allow-Headers", "Authorization, Content-Type"));
    }

    @Test
    void allowsLocalForgeHttpsOriginForAttachmentUpload() throws Exception {
        String localForgeOrigin = "https://localhost:5173";
        MockMvc mvc = mockMvc(List.of(ALLOWED_ORIGIN, localForgeOrigin));

        mvc.perform(options("/api/claude-chat/sessions/session-1/attachments")
                        .header("Origin", localForgeOrigin)
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "Authorization,Content-Type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", localForgeOrigin));
    }

    @Test
    void doesNotOpenTheRegularLoginEndpoint() throws Exception {
        MockMvc mvc = mockMvc(List.of(ALLOWED_ORIGIN));

        mvc.perform(options("/api/auth/login")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    void rejectsWildcardOriginConfiguration() {
        AuthProperties properties = properties(List.of("https://*.example.com"));
        ExternalLoginCorsConfiguration configuration = new ExternalLoginCorsConfiguration();

        assertThatThrownBy(() -> configuration.externalLoginCorsFilter(properties))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("禁止使用通配符");
    }

    private MockMvc mockMvc(List<String> allowedOrigins) {
        FilterRegistrationBean<CorsFilter> registration = new ExternalLoginCorsConfiguration()
                .externalLoginCorsFilter(properties(allowedOrigins));
        return MockMvcBuilders.standaloneSetup(new LoginProbeController())
                .addFilters(registration.getFilter())
                .build();
    }

    private AuthProperties properties(List<String> allowedOrigins) {
        AuthProperties properties = new AuthProperties();
        properties.getExternalLogin().setEnabled(true);
        properties.getExternalLogin().setAllowedOrigins(allowedOrigins);
        return properties;
    }

    @RestController
    private static class LoginProbeController {

        @PostMapping("/api/auth/external-login")
        void login() {
        }

        @PostMapping("/api/auth/login")
        void regularLogin() {
        }

        @PostMapping("/api/claude-chat/sessions/{sessionId}/attachments")
        void upload() {
        }
    }
}
