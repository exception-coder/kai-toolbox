package com.exceptioncoder.toolbox.claudechat.workassistants;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.core.io.ClassPathResource;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AssistantConversationServiceTest {
    SingleConnectionDataSource source;
    AssistantSessions store;
    AssistantEvidence evidence;
    AgentOneShotRunner runner;
    AssistantConversationService service;

    @BeforeEach void setup() {
        source = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        new ResourceDatabasePopulator(new ClassPathResource("db/work-assistants-schema.sql")).execute(source);
        store = new AssistantSessions(new JdbcTemplate(source));
        evidence = mock(AssistantEvidence.class); runner = mock(AgentOneShotRunner.class);
        when(runner.supportedEngines()).thenReturn(Set.of("codex", "claude"));
        when(evidence.collect(any(), any())).thenReturn("提交 abcdef1：改进报表；仅代码实现，未发布");
        service = new AssistantConversationService(store, new AssistantCatalog(), evidence, runner);
        AuthContext.set(new AuthPrincipal(1, "admin", List.of("ADMIN"), List.of(), "test", Long.MAX_VALUE));
    }
    @AfterEach void cleanup() { AuthContext.clear(); source.destroy(); }
    AssistantConversationService.Create create() {
        return new AssistantConversationService.Create("weekly", true, "codex", "", null, UUID.randomUUID().toString());
    }

    @Test void creationIsIdempotentAndSkillIsBoundToStoredSnapshot() {
        var command = create();
        var first = service.create(command);
        assertThat(service.create(command).id()).isEqualTo(first.id());
        verify(evidence, times(1)).collect(any(), any());
        assertThat(first.skillHash()).hasSize(64);
        assertThat(store.required(1, first.id()).skillText()).contains("name: git-weekly-report");
        AuthContext.set(new AuthPrincipal(2, "other", List.of("ADMIN"), List.of(), "test", Long.MAX_VALUE));
        assertThat(service.list()).isEmpty();
        assertThatThrownBy(() -> service.read(first.id())).hasMessageContaining("无权访问");
    }

    @Test void oneTurnRunsOnceWithToolsDisabledAndBoundedConversationMemory() throws Exception {
        var request = new java.util.concurrent.atomic.AtomicReference<AgentOneShotRunner.ExecutionRequest>();
        var latch = new CountDownLatch(1);
        when(runner.runOnce(any(AgentOneShotRunner.ExecutionRequest.class))).thenAnswer(invocation -> {
            request.set(invocation.getArgument(0)); latch.countDown(); return "本周改进了业务报表，尚未发布。";
        });
        var session = service.create(create());
        var command = new AssistantConversationService.Message(UUID.randomUUID().toString(), "整理本周周报");
        var first = service.submit(session.id(), command);
        assertThat(service.submit(session.id(), command).id()).isEqualTo(first.id());
        assertThat(latch.await(5, TimeUnit.SECONDS)).isTrue();
        for (int i = 0; i < 100 && service.read(session.id()).turns().getFirst().status().equals("RUNNING"); i++) {
            Thread.sleep(10);
        }
        assertThat(service.read(session.id()).turns().getFirst().status()).isEqualTo("COMPLETED");
        assertThat(request.get().toolPolicy()).isEqualTo("disabled");
        assertThat(request.get().systemPrompt()).contains("name: git-weekly-report");
        assertThat(request.get().userPrompt()).contains("abcdef1", "整理本周周报");
        verify(runner, times(1)).runOnce(any(AgentOneShotRunner.ExecutionRequest.class));
    }

    @Test void secretsAreRejectedBeforeSavingOrCallingTheModelAndRecoveryIsExplicit() {
        var session = service.create(create());
        assertThatThrownBy(() -> service.submit(session.id(), new AssistantConversationService.Message(
                UUID.randomUUID().toString(), "密码：private-value"))).hasMessageContaining("未保存");
        assertThat(service.read(session.id()).turns()).isEmpty();
        store.start(session.id(), UUID.randomUUID().toString(), "正常需求");
        service.recoverInterrupted();
        assertThat(service.read(session.id()).turns().getFirst().status()).isEqualTo("FAILED");
        verify(runner, never()).runOnce(any(AgentOneShotRunner.ExecutionRequest.class));
    }

    @Test void rejectsAnotherActiveTurnAndCancellationCannotBeOverwrittenByLateSuccess() throws Exception {
        var started = new CountDownLatch(1);
        var released = new CountDownLatch(1);
        when(runner.runOnce(any(AgentOneShotRunner.ExecutionRequest.class))).thenAnswer(invocation -> {
            started.countDown();
            try {
                new CountDownLatch(1).await(5, TimeUnit.SECONDS);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
            released.countDown();
            return "迟到成功结果";
        });
        var session = service.create(create());
        var first = service.submit(session.id(), new AssistantConversationService.Message(
                UUID.randomUUID().toString(), "请整理"));
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
        assertThatThrownBy(() -> service.submit(session.id(), new AssistantConversationService.Message(
                UUID.randomUUID().toString(), "另一任务"))).hasMessageContaining("任务进行中");
        service.cancel(session.id(), first.id());
        assertThat(released.await(5, TimeUnit.SECONDS)).isTrue();
        Thread.sleep(50);
        assertThat(service.read(session.id()).turns().getFirst().status()).isEqualTo("CANCELLED");
        assertThat(service.read(session.id()).turns().getFirst().output()).isEmpty();
    }
}
