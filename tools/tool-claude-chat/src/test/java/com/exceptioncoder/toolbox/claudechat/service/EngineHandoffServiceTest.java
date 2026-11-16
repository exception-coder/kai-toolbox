package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.EngineHandoffRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class EngineHandoffServiceTest {
    @TempDir Path evidence;
    Connection connection;
    JdbcTemplate jdbc;
    EngineHandoffRepository repository;
    EngineHandoffService service;
    final ObjectMapper mapper = new ObjectMapper();
    final ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
    final ClaudeChatConversationDeltaReader history = mock(ClaudeChatConversationDeltaReader.class);
    final ClaudeChatSession session = ClaudeChatSession.builder().id("session").engine("codex")
            .sdkSessionId("codex-native").engineSessions("{\"codex\":\"codex-native\"}").cwd("work").build();

    @BeforeEach void setUp() throws Exception {
        connection = DriverManager.getConnection("jdbc:sqlite::memory:");
        jdbc = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
        jdbc.execute("PRAGMA foreign_keys=ON");
        jdbc.execute("CREATE TABLE claude_chat_session(id TEXT PRIMARY KEY)");
        jdbc.update("INSERT INTO claude_chat_session VALUES (?)", session.getId());
        try (var stream = getClass().getResourceAsStream("/db/claude-chat-handoff-schema.sql")) {
            String schema = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            for (int pass = 0; pass < 2; pass++) {
                for (String statement : schema.split(";")) {
                    if (!statement.isBlank()) { jdbc.execute(statement); }
                }
            }
        }
        repository = new EngineHandoffRepository(jdbc);
        when(history.readForHandoff("session")).thenReturn(
                new ClaudeChatConversationDeltaReader.ConversationRead(List.of(), List.of()));
        when(sessions.findById("session")).thenReturn(Optional.of(session));
        doAnswer(invocation -> {
            session.setEngine(invocation.getArgument(1));
            session.setEngines(invocation.getArgument(2));
            session.setSdkSessionId(invocation.getArgument(3));
            session.setEngineSessions(invocation.getArgument(4));
            return null;
        }).when(sessions).switchEngine(anyString(), anyString(), anyString(), anyString(), anyString());
        service = freshService();
        service.initialize("session");
    }

    @AfterEach void close() throws Exception { connection.close(); }

    EngineHandoffService freshService() { return new EngineHandoffService(repository, sessions, history, mapper, evidence); }

    @Test void roundTripsAcrossThreeEnginesAndRestartUseIndependentNativeCursors() {
        service.record("session", "a", "codex", "user", "目标：修复输入");
        var first = service.prepare(session, "claude", null);
        assertThat(session.getEngine()).isEqualTo("codex");
        assertThat(service.commit("session", first.requestId, "claude-native")).isTrue();
        service.activated("session", "claude", "claude-native");
        service.record("session", "b", "claude", "assistant", "CLAUDE_CHANGE");
        var second = service.prepare(session, "pi", null);
        assertThat(service.commit("session", second.requestId, "pi-native")).isTrue();
        service.activated("session", "pi", "pi-native");
        service.record("session", "c", "pi", "assistant", "PI_CHANGE");
        service = freshService();
        var back = service.prepare(session, "codex", "codex-native");
        assertThat(back.prompt).contains("CLAUDE_CHANGE", "PI_CHANGE");
        assertThat(service.commit("session", back.requestId, "codex-native")).isTrue();
        service.activated("session", "codex", "codex-native");
        service.record("session", "d", "codex", "assistant", "CODEX_NEW_CHANGE");
        var again = service.prepare(session, "claude", "claude-native");
        assertThat(again.prompt).contains("PI_CHANGE", "CODEX_NEW_CHANGE").doesNotContain("CLAUDE_CHANGE");
        assertThat(service.commit("session", again.requestId, "claude-native")).isTrue();
        service.activated("session", "claude", "claude-native");
        assertThat(session.getEngineSessions()).contains("codex-native", "claude-native", "pi-native");
    }

    @Test void failureAndLateAcknowledgementCannotAdvanceOrChangeCurrentEngine() {
        service.record("session", "a", "codex", "user", "约束原文");
        var state = service.prepare(session, "claude", null);
        service.fail("session", state.requestId, "认证失败");
        assertThat(service.commit("session", state.requestId, "late-native")).isFalse();
        assertThat(service.state("session").cursors).doesNotContainKey("claude");
        var retry = service.prepare(session, "claude", null);
        assertThat(retry.prompt).contains("约束原文");
        assertThat(retry.requestId).isNotEqualTo(state.requestId);
        assertThat(session.getEngine()).isEqualTo("codex");
    }

    @Test void duplicateTargetReusesPendingAndDifferentTargetIsRejected() {
        var first = service.prepare(session, "claude", null);
        assertThat(service.prepare(session, "claude", null).requestId).isEqualTo(first.requestId);
        assertThatThrownBy(() -> service.prepare(session, "pi", null)).isInstanceOf(IllegalStateException.class);
        assertThat(service.commit("session", "stale", "native")).isFalse();
    }

    @Test void restartDoesNotReplayUnconfirmedHandoffAndKeepsOriginalBinding() {
        service.prepare(session, "claude", null);
        service = freshService();
        assertThat(service.state("session").status).isEqualTo("FAILED");
        assertThat(service.busy("session")).isFalse();
        assertThat(session.getEngine()).isEqualTo("codex");
    }

    @Test void longOriginalEvidenceIsRetainedAndNativeIdentityMismatchIsRejected() throws Exception {
        String longText = "完整约束".repeat(20000);
        service.record("session", "long", "codex", "user", longText);
        var state = service.prepare(session, "claude", "expected");
        assertThat(state.prompt.length()).isLessThan(60_000);
        assertThat(java.nio.file.Files.readString(evidence.resolve(state.requestId + ".json"))).contains(longText);
        assertThatThrownBy(() -> service.commit("session", state.requestId, "replacement")).isInstanceOf(IllegalStateException.class);
        assertThat(session.getEngine()).isEqualTo("codex");
    }

    @Test void messageIdentityIsStableAndSessionDeletionCascades() {
        service.record("session", "turn:user", "codex", "user", "一次");
        long sequence = repository.messages("session", 0).getFirst().sequence();
        service.record("session", "turn:user", "codex", "user", "一次");
        assertThat(repository.messages("session", 0)).hasSize(1);
        assertThat(repository.messages("session", 0).getFirst().sequence()).isEqualTo(sequence);
        jdbc.update("DELETE FROM claude_chat_session WHERE id=?", "session");
        assertThat(repository.state("session")).isEmpty();
        assertThat(repository.messages("session", 0)).isEmpty();
    }

    @Test void changedAccountEnvironmentOrConfigurationCannotCommitStalePreparation() {
        var state = service.prepare(session, "claude", null);
        session.setCodexHome("different-auth-directory");
        assertThatThrownBy(() -> service.commit("session", state.requestId, "new-native"))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("配置已变化");
        assertThat(session.getEngine()).isEqualTo("codex");
    }

    @Test void committedBindingRemainsBlockedAcrossRestartUntilMatchingRuntimeConfirmation() {
        var state = service.prepare(session, "pi", null);
        assertThat(service.commit("session", state.requestId, "pi-native")).isTrue();
        service = freshService();
        assertThat(service.busy("session")).isTrue();
        service.activated("session", "codex", "codex-native");
        assertThat(service.busy("session")).isTrue();
        assertThatThrownBy(() -> service.prepare(session, "claude", null)).isInstanceOf(IllegalStateException.class);
        service.activated("session", "pi", "pi-native");
        assertThat(service.busy("session")).isFalse();
        assertThat(service.state("session").status).isEqualTo("COMPLETED");
    }
}
