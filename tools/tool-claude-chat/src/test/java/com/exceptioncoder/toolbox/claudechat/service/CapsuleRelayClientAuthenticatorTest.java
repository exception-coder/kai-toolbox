package com.exceptioncoder.toolbox.claudechat.service;

import org.springframework.mock.env.MockEnvironment;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CapsuleRelayClientAuthenticatorTest {
    private static final String PREFIX = "toolbox.claude-chat.session-client.relay";

    @Test
    void managedClientRefreshRevokesOldCredentialsWithoutLegacyFallback() {
        var environment = properties(true);
        environment.setProperty(PREFIX + ".managed", "true");
        environment.setProperty(PREFIX + ".clients[0].client-id", "host");
        environment.setProperty(PREFIX + ".clients[0].name", "Host");
        environment.setProperty(PREFIX + ".clients[0].client-secret", "first");
        var auth = new CapsuleRelayClientAuthenticator(environment);
        assertThat(auth.authenticate(basic("host", "first"))).isEqualTo("host");
        assertThatThrownBy(() -> auth.authenticate(basic("business-app", "secret-value")))
                .isInstanceOf(IllegalArgumentException.class);
        environment.setProperty(PREFIX + ".clients[0].client-secret", "second");
        auth.onConfigurationChanged(new org.springframework.cloud.context.environment.EnvironmentChangeEvent(
                java.util.Set.of(PREFIX + ".clients[0].client-secret")));
        assertThatThrownBy(() -> auth.authenticate(basic("host", "first")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(auth.authenticate(basic("host", "second"))).isEqualTo("host");
        environment.setProperty(PREFIX + ".clients[0].enabled", "false");
        auth.onConfigurationChanged(new org.springframework.cloud.context.environment.EnvironmentChangeEvent(
                java.util.Set.of(PREFIX + ".clients[0].enabled")));
        assertThatThrownBy(() -> auth.authenticate(basic("host", "second")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void emptyManagedListAndDefaultConfigurationRejectAllCredentials() {
        var environment = properties(true);
        environment.setProperty(PREFIX + ".managed", "true");
        var managed = new CapsuleRelayClientAuthenticator(environment);
        var defaults = new CapsuleRelayClientAuthenticator(new MockEnvironment());
        assertThatThrownBy(() -> managed.authenticate(basic("business-app", "secret-value")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> defaults.authenticate(basic("business-app", "secret-value")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void acceptsConfiguredBasicCredential() {
        MockEnvironment properties = properties(true);
        CapsuleRelayClientAuthenticator authenticator = new CapsuleRelayClientAuthenticator(properties);

        assertThat(authenticator.authenticate(basic("business-app", "secret-value")))
                .isEqualTo("business-app");
    }

    @Test
    void rejectsDisabledOrInvalidCredential() {
        CapsuleRelayClientAuthenticator disabled = new CapsuleRelayClientAuthenticator(properties(false));
        CapsuleRelayClientAuthenticator enabled = new CapsuleRelayClientAuthenticator(properties(true));

        assertThatThrownBy(() -> disabled.authenticate(basic("business-app", "secret-value")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> enabled.authenticate(basic("business-app", "wrong")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> enabled.authenticate("Basic malformed"))
                .isInstanceOf(IllegalArgumentException.class);
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
