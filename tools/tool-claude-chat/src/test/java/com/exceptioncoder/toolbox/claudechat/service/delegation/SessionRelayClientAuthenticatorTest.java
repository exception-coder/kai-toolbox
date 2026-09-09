package com.exceptioncoder.toolbox.claudechat.service.delegation;

import org.springframework.mock.env.MockEnvironment;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantException;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SessionRelayClientAuthenticatorTest {
    @Test
    void acceptsConfiguredBasicCredential() {
        MockEnvironment properties = properties(true);
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

    private static MockEnvironment properties(boolean enabled) {
        MockEnvironment properties = new MockEnvironment();
        properties.setProperty("toolbox.claude-chat.session-client.relay.enabled", String.valueOf(enabled));
        properties.setProperty("toolbox.claude-chat.session-client.relay.client-id", "business-app");
        properties.setProperty("toolbox.claude-chat.session-client.relay.client-secret", "secret-value");
        return properties;
    }

    private static String basic(String id, String secret) {
        return "Basic " + Base64.getEncoder().encodeToString(
                (id + ":" + secret).getBytes(StandardCharsets.UTF_8));
    }
}
