package com.exceptioncoder.toolbox.claudechat.service;

import org.junit.jupiter.api.Test;

import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;

class SessionExecutionPolicyTest {

    @Test
    void consultEndpointAlwaysSelectsReadonlyPolicy() {
        assertThat(SessionExecutionPolicy.forWebSocket(
                URI.create("ws://localhost/api/claude-chat/consult/ws?access_token=x")))
                .isEqualTo(SessionExecutionPolicy.CONSULT_READONLY);
        assertThat(SessionExecutionPolicy.CONSULT_CODEX_HOME)
                .isEqualTo("C:\\Users\\zhang\\.codex-account-yx");
    }

    @Test
    void adminEndpointAndUnknownStoredValuesStayStandard() {
        assertThat(SessionExecutionPolicy.forWebSocket(
                URI.create("ws://localhost/api/claude-chat/ws")))
                .isEqualTo(SessionExecutionPolicy.STANDARD);
        assertThat(SessionExecutionPolicy.normalize("unexpected"))
                .isEqualTo(SessionExecutionPolicy.STANDARD);
    }
}
