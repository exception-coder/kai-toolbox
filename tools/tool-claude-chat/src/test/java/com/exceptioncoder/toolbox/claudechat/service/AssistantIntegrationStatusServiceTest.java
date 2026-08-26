package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatWsProperties;
import com.exceptioncoder.toolbox.common.auth.config.AuthProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AssistantIntegrationStatusServiceTest {

    @Test
    void exposesEffectiveNonSensitiveConfiguration() {
        AuthProperties auth = new AuthProperties();
        auth.getExternalLogin().setEnabled(true);
        auth.getExternalLogin().setAllowedOrigins(List.of("https://erp.example.com"));
        ClaudeChatWsProperties ws = new ClaudeChatWsProperties();
        ws.setConsultAllowedOriginPatterns(List.of("https://erp.example.com"));
        DefaultListableBeanFactory beans = new DefaultListableBeanFactory();
        beans.registerSingleton("authProperties", auth);

        var status = new AssistantIntegrationStatusService(beans.getBeanProvider(AuthProperties.class), ws).current();

        assertThat(status.externalLoginConfigured()).isTrue();
        assertThat(status.websocketOriginsRestricted()).isTrue();
        assertThat(status.externalLoginAllowedOrigins()).containsExactly("https://erp.example.com");
        assertThat(status.consultAllowedOriginPatterns()).containsExactly("https://erp.example.com");
    }

    @Test
    void reportsDefaultWebSocketWildcardAsUnrestricted() {
        ClaudeChatWsProperties ws = new ClaudeChatWsProperties();
        DefaultListableBeanFactory beans = new DefaultListableBeanFactory();

        var status = new AssistantIntegrationStatusService(beans.getBeanProvider(AuthProperties.class), ws).current();

        assertThat(status.externalLoginConfigured()).isFalse();
        assertThat(status.websocketOriginsRestricted()).isFalse();
        assertThat(status.consultAllowedOriginPatterns()).containsExactly("*");
    }
}
