package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.PlanReviewRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.web.server.ResponseStatusException;
import java.sql.Connection;
import java.sql.DriverManager;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PlanReviewServiceTest {
    Connection connection;
    JdbcTemplate jdbc;
    PlanReviewRepository repository;
    final ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
    final ClaudeChatSessionAccessPolicy access = mock(ClaudeChatSessionAccessPolicy.class);
    final EngineCatalogService catalog = mock(EngineCatalogService.class);
    final PlanReviewRunner runner = mock(PlanReviewRunner.class);
    final ClaudeChatSession source = ClaudeChatSession.builder().id("source").engine("codex")
            .sdkSessionId("original-native").cwd("project").executionPolicy("standard").build();
    final List<Runnable> work = new ArrayList<>();
    PlanReviewService service;

    @BeforeEach void setup() throws Exception {
        connection = DriverManager.getConnection("jdbc:sqlite::memory:");
        jdbc = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
        jdbc.execute("PRAGMA foreign_keys=ON");
        jdbc.execute("CREATE TABLE claude_chat_session(id TEXT PRIMARY KEY)");
        jdbc.update("INSERT INTO claude_chat_session VALUES ('source')");
        try (var stream = getClass().getResourceAsStream("/db/claude-chat-plan-review-schema.sql")) {
            String schema = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            for (int pass = 0; pass < 2; pass++) for (String sql : schema.split(";")) if (!sql.isBlank()) jdbc.execute(sql);
        }
        repository = new PlanReviewRepository(jdbc);
        when(access.canAccessCurrentUser("source")).thenReturn(true);
        when(sessions.findById("source")).thenReturn(Optional.of(source));
        when(catalog.selectable(anyString())).thenReturn(true);
        when(runner.run(any(), anyString(), anyString(), anyString())).thenReturn(new PlanReviewRunner.Result("建议核验权限", "native-model"));
        service = fresh();
    }
    @AfterEach void close() throws Exception { connection.close(); }
    PlanReviewService fresh() { return new PlanReviewService(repository, sessions, access, catalog, runner, new ObjectMapper(), work::add); }
    PlanReviewService.Create command(String id) { return new PlanReviewService.Create(id, "message", "方案原文", "权限", List.of("codex", "claude")); }

    @Test void duplicateRequestsReuseSnapshotAndRejectDifferentMaterial() {
        String id = UUID.randomUUID().toString();
        service.create("source", command(id)); service.create("source", command(id));
        assertThat(work).hasSize(2);
        assertThatThrownBy(() -> service.create("source", new PlanReviewService.Create(id, "message", "不同方案", "权限", List.of("codex", "claude"))))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("409");
        assertThat(service.get("source", id).material).isEqualTo("方案原文");
    }

    @Test void expandedEngineSelectionPreservesIndependentTasksAndRejectsUnsupportedOrUnavailable() {
        var all = PlanReviewService.ENGINES.stream().sorted().toList();
        var batch = service.create("source", new PlanReviewService.Create(UUID.randomUUID().toString(), "m", "方案", "", all));
        assertThat(batch.tasks).extracting(t -> t.engine).containsExactlyElementsOf(all);
        assertThat(work).hasSize(all.size());
        assertThatThrownBy(() -> service.create("source", new PlanReviewService.Create(UUID.randomUUID().toString(), "m", "方案", "", List.of("trae"))))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("400");
        when(catalog.selectable("zcode")).thenReturn(false);
        assertThatThrownBy(() -> service.create("source", new PlanReviewService.Create(UUID.randomUUID().toString(), "m", "方案", "", List.of("zcode"))))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("不可用");
    }

    @Test void independentFailureAndSuccessDoNotChangeSourceAndRetryOnlyFailedEngine() throws Exception {
        when(runner.run(any(), anyString(), eq("claude"), anyString())).thenThrow(new PlanReviewRunner.ReviewFailure("认证不可用"));
        var batch = service.create("source", command(UUID.randomUUID().toString()));
        List.copyOf(work).forEach(Runnable::run);
        var result = service.get("source", batch.id);
        assertThat(result.tasks).extracting(t -> t.status).containsExactly("FAILED", "SUCCEEDED");
        assertThat(result.tasks.getFirst().error).isEqualTo("认证不可用");
        verify(runner).run(eq(source), anyString(), eq("codex"), contains("方案原文"));
        assertThat(source.getEngine()).isEqualTo("codex");
        assertThat(source.getSdkSessionId()).isEqualTo("original-native");
        String retry = UUID.randomUUID().toString();
        service.retry("source", batch.id, "claude", retry); service.retry("source", batch.id, "claude", retry);
        assertThat(work).hasSize(3);
        assertThat(service.get("source", batch.id).tasks.getLast().result).isEqualTo("建议核验权限");
        verify(sessions, never()).switchEngine(anyString(), anyString(), anyString(), anyString(), anyString());
    }

    @Test void cancellationBeforeDispatchSkipsCallAndDuringRunRejectsLateResult() throws Exception {
        var batch = service.create("source", command(UUID.randomUUID().toString()));
        service.cancel("source", batch.id, "claude");
        work.getFirst().run();
        verify(runner, never()).run(any(), anyString(), eq("claude"), anyString());
        when(runner.run(any(), anyString(), eq("codex"), anyString())).thenAnswer(call -> {
            service.cancel("source", batch.id, "codex");
            return new PlanReviewRunner.Result("迟到意见", "model");
        });
        work.getLast().run();
        assertThat(service.get("source", batch.id).tasks).allSatisfy(task -> {
            assertThat(task.status).isEqualTo("CANCELLED"); assertThat(task.result).isNull();
        });
    }

    @Test void restartMarksUnconfirmedWithoutAutomaticReplay() {
        var batch = service.create("source", command(UUID.randomUUID().toString()));
        service = fresh();
        assertThat(service.get("source", batch.id).tasks).allSatisfy(task -> assertThat(task.status).isEqualTo("INTERRUPTED"));
        assertThat(work).hasSize(2);
        service.create("source", command(batch.id));
        assertThat(work).hasSize(2);
    }

    @Test void everyReadAndWriteChecksSourceAccess() {
        var batch = service.create("source", command(UUID.randomUUID().toString()));
        when(access.canAccessCurrentUser("source")).thenReturn(false);
        assertThatThrownBy(() -> service.list("source")).isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");
        assertThatThrownBy(() -> service.get("source", batch.id)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.cancel("source", batch.id, "claude")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.retry("source", batch.id, "claude", UUID.randomUUID().toString())).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.create("source", command(UUID.randomUUID().toString()))).isInstanceOf(ResponseStatusException.class);
    }

    @Test void restrictedSessionsAndUnsupportedEngineAreRejectedBeforeDispatch() {
        source.setExecutionPolicy("review-only");
        assertThatThrownBy(() -> service.create("source", command(UUID.randomUUID().toString()))).isInstanceOf(ResponseStatusException.class);
        source.setExecutionPolicy("standard");
        assertThatThrownBy(() -> service.create("source", new PlanReviewService.Create(UUID.randomUUID().toString(), "m", "正文", "", List.of("trae"))))
                .isInstanceOf(ResponseStatusException.class);
        assertThat(work).isEmpty();
    }

    @Test void queuedWorkChecksProjectPolicyAgainAndDeletedSessionCascades() throws Exception {
        var batch = service.create("source", command(UUID.randomUUID().toString()));
        doThrow(new IllegalArgumentException("excluded")).when(access).requireProjectAllowed("project");
        work.forEach(Runnable::run);
        verify(runner, never()).run(any(), anyString(), anyString(), anyString());
        doNothing().when(access).requireProjectAllowed("project");
        assertThat(service.get("source", batch.id).tasks).allSatisfy(task -> assertThat(task.status).isEqualTo("FAILED"));
        jdbc.update("DELETE FROM claude_chat_session WHERE id='source'");
        assertThat(repository.list("source")).isEmpty();
    }

    @Test void capsActiveBatchesAndRejectsOversizedMaterial() {
        var old = service.create("source", command(UUID.randomUUID().toString()));
        service.cancel("source", old.id, "claude"); service.cancel("source", old.id, "codex");
        service.create("source", command(UUID.randomUUID().toString()));
        service.create("source", command(UUID.randomUUID().toString()));
        assertThatThrownBy(() -> service.retry("source", old.id, "codex", UUID.randomUUID().toString()))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("两批");
        assertThatThrownBy(() -> service.create("source", command(UUID.randomUUID().toString())))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("两批");
        assertThatThrownBy(() -> service.create("source", new PlanReviewService.Create(UUID.randomUUID().toString(), "m", "x".repeat(100001), "", List.of("codex"))))
                .isInstanceOf(ResponseStatusException.class);
    }
}
