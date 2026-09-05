package com.exceptioncoder.toolbox.claudechat.service.delegation;

import com.exceptioncoder.toolbox.claudechat.config.SessionClientProperties;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantException;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SessionRelayClientAuthenticatorTest {
    @Test
    void acceptsConfiguredBasicCredential() {
        SessionClientProperties properties = properties(true);
        SessionRelayClientAuthenticator authenticator = new SessionRelayClientAuthenticator(properties);

        assertThat(authenticator.authenticate(basic("business-app", "secret-value")))
                .isEqualTo("business-app");
    }

    @Test
    void rejectsDisabledOrInvalidCredential() {
        SessionRelayClientAuthenticator disabled = new SessionRelayClientAuthenticator(properties(false));
        SessionRelayClientAuthenticator enabled = new SessionRelayClientAuthenticator(properties(true));

        assertThatThrownBy(() -> disabled.authenticate(basic("business-app", "secret-value")))
                .isInstanceOf(SessionGrantException.class);
        assertThatThrownBy(() -> enabled.authenticate(basic("business-app", "wrong")))
                .isInstanceOf(SessionGrantException.class);
        assertThatThrownBy(() -> enabled.authenticate("Basic malformed"))
                .isInstanceOf(SessionGrantException.class);
    }

    private static SessionClientProperties properties(boolean enabled) {
        SessionClientProperties properties = new SessionClientProperties();
        properties.getRelay().setEnabled(enabled);
        properties.getRelay().setClientId("business-app");
        properties.getRelay().setClientSecret("secret-value");
        return properties;
    }

    private static String basic(String id, String secret) {
        return "Basic " + Base64.getEncoder().encodeToString(
                (id + ":" + secret).getBytes(StandardCharsets.UTF_8));
    }
}
