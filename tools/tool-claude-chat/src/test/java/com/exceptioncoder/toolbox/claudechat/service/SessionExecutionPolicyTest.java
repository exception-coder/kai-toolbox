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
    }

    @Test
    void officialCodexUsesTrimmedDirectoryPassedByBrowser() {
        assertThat(SessionExecutionPolicy.resolveCodexHome(
                "codex", null, "  C:\\Users\\zhang\\.codex  "))
                .isEqualTo("C:\\Users\\zhang\\.codex");
        assertThat(SessionExecutionPolicy.resolveCodexHome("codex", null, " ")).isNull();
    }

    @Test
    void claudeRetainsCodexDirectoryForLaterEngineSwitchButGatewayIgnoresIt() {
        assertThat(SessionExecutionPolicy.resolveCodexHome(
                "claude", null, "C:\\Users\\zhang\\.codex"))
                .isEqualTo("C:\\Users\\zhang\\.codex");
        assertThat(SessionExecutionPolicy.resolveCodexHome(
                "codex", "https://gateway.example.com", "C:\\Users\\zhang\\.codex")).isNull();
    }

    @Test
    void adminEndpointAndUnknownStoredValuesStayStandard() {
        assertThat(SessionExecutionPolicy.forWebSocket(
                URI.create("ws://localhost/api/claude-chat/ws")))
                .isEqualTo(SessionExecutionPolicy.STANDARD);
        assertThat(SessionExecutionPolicy.normalize("unexpected"))
                .isEqualTo(SessionExecutionPolicy.STANDARD);
    }

    @Test
    void websocketChannelOnlyBindsSessionsFromTheSameExecutionDomain() {
        assertThat(SessionExecutionPolicy.canBind(
                SessionExecutionPolicy.STANDARD, SessionExecutionPolicy.STANDARD)).isTrue();
        assertThat(SessionExecutionPolicy.canBind(
                SessionExecutionPolicy.CONSULT_READONLY, SessionExecutionPolicy.CONSULT_READONLY)).isTrue();
        assertThat(SessionExecutionPolicy.canBind(
                SessionExecutionPolicy.STANDARD, SessionExecutionPolicy.CONSULT_READONLY)).isFalse();
        assertThat(SessionExecutionPolicy.canBind(
                SessionExecutionPolicy.CONSULT_READONLY, SessionExecutionPolicy.STANDARD)).isFalse();
        assertThat(SessionExecutionPolicy.forWebSocket(
                URI.create("ws://localhost/api/claude-chat/review/ws?review_token=x")))
                .isEqualTo(SessionExecutionPolicy.REVIEW_ONLY);
        assertThat(SessionExecutionPolicy.canBind(
                SessionExecutionPolicy.REVIEW_ONLY, SessionExecutionPolicy.REVIEW_ONLY)).isTrue();
        assertThat(SessionExecutionPolicy.canBind(
                SessionExecutionPolicy.REVIEW_ONLY, SessionExecutionPolicy.STANDARD)).isFalse();
        assertThat(SessionExecutionPolicy.canBind(
                SessionExecutionPolicy.STANDARD, SessionExecutionPolicy.REVIEW_ONLY)).isTrue();
    }
}
