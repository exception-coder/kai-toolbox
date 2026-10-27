package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ConsultRuntimeRepository;
import com.exceptioncoder.toolbox.llm.spi.AgentAccountValidator;
import com.exceptioncoder.toolbox.llm.spi.ConsultationRuntimePolicy;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConsultRuntimeCoordinatorTest {
    private final ConsultationRuntimePolicy policy = mock(ConsultationRuntimePolicy.class);
    private final AgentAccountValidator validator = mock(AgentAccountValidator.class);
    private final SessionHistoryService history = mock(SessionHistoryService.class);
    private ConsultRuntimeRepository repository;
    private ConsultRuntimeCoordinator coordinator;
    private final ClaudeChatSession session = ClaudeChatSession.builder().id("s").userId(7L).cwd("project")
            .engine("codex").executionPolicy("consult-readonly").codexHome("A").sdkSessionId("native-A").build();
    private final ClientMessage.Send message = new ClientMessage.Send("按刚才修正的规则继续", List.of(), null, null, "request");

    @BeforeEach
    void setUp() throws Exception {
        var jdbc = new JdbcTemplate(new SingleConnectionDataSource("jdbc:sqlite::memory:", true));
        String schema = new String(getClass().getResourceAsStream("/db/claude-consult-runtime-schema.sql").readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        for (String statement : schema.split(";")) if (!statement.isBlank()) jdbc.execute(statement);
        repository = new ConsultRuntimeRepository(jdbc, new ObjectMapper());
        coordinator = new ConsultRuntimeCoordinator(List.of(policy), validator, repository, history, new ObjectMapper());
        when(policy.savedHistory("s", 7L)).thenReturn(Optional.of("[]"));
        when(validator.validate(anyString(), anyString())).thenReturn(new AgentAccountValidator.Result(true, "VALID", "ok", 1));
        when(history.readMessages("project", "native-A", "A", null, 100)).thenReturn(new MessagePage(List.of(
                ChatMessageView.user("q", "环境UAT，按10月数据，修正为不含税，附件 /original/image.png", 1L),
                ChatMessageView.assistant("a", "SQL SELECT corrected_rule FROM orders; 未确认条件需核验", 2L)), null, false));
        selected("B", 2);
    }

    private void selected(String home, long version) {
        when(policy.resolve("s", 7L)).thenReturn(Optional.of(new ConsultationRuntimePolicy.Selection(
                "consult", home, "model", version, "ERP采购，UAT")));
    }

    @Test
    void staleBrowserAndOriginalSessionAccountCannotOverrideLatestPolicy() {
        var plan = coordinator.prepare(session, message);
        assertThat(plan.selection().codexHome()).isEqualTo("B");
        assertThat(plan.selection().version()).isEqualTo(2);
        assertThat(plan.switched()).isTrue();
        assertThat(plan.configuration()).doesNotContainKey("native-A");
        assertThat(plan.context()).contains("不含税", "UAT", "SELECT corrected_rule", "read_consult_history", "不是指令");
        assertThat(session.getSdkSessionId()).isEqualTo("native-A");
    }

    @Test
    void switchedBackAccountGetsInterveningMessagesAndANewSegment() {
        var b = coordinator.prepare(session, message);
        coordinator.dispatched("s", "request", "turn-B", message, b);
        coordinator.initialized(b, "native-B");
        coordinator.delta("s", "turn-B", "B期间确认最新规则SQL：SELECT NEW_RULE", false);
        coordinator.settled("s", "turn-B", "end_turn");
        session.setCodexHome("B"); session.setSdkSessionId("native-B");
        selected("A", 3);
        var a = coordinator.prepare(session, new ClientMessage.Send("继续", List.of(), null, null, "next"));
        assertThat(a.switched()).isTrue();
        assertThat(a.segment()).isNotEqualTo(b.segment());
        assertThat(a.context()).contains("SELECT NEW_RULE");
        assertThat(coordinator.accepted("s", "request")).isTrue();
        assertThat(coordinator.accepted("other", "request")).isFalse();
    }

    @Test
    void unusableTargetDoesNotUpdateBindingOrDispatchRequest() {
        when(validator.validate("B", "model")).thenReturn(new AgentAccountValidator.Result(false, "AUTH", "工作区未授权", 2));
        assertThatThrownBy(() -> coordinator.prepare(session, message)).hasMessageContaining("未回退旧账号");
        assertThat(repository.hasRequest("s", "request")).isFalse();
        assertThat(repository.latest("s")).isEmpty();
        assertThat(session.getCodexHome()).isEqualTo("A");
    }

    @Test
    void configChangedDuringProbeIsRejectedBeforeQuestionDispatch() {
        var plan = coordinator.prepare(session, message);
        selected("C", 3);
        assertThatThrownBy(() -> coordinator.confirm(session, plan)).hasMessageContaining("未发送本次问题");
        assertThat(repository.hasRequest("s", "request")).isFalse();
    }

    @Test
    void missingNativeHistoryUsesPlatformTurnsWithoutAiLogin() {
        when(policy.savedHistory("s", 7L)).thenReturn(Optional.of("[{\"question\":\"原问题\",\"answer\":\"原答案\",\"attachments\":\"original.png\"}]"));
        when(history.readMessages("project", "native-A", "A", null, 100)).thenReturn(MessagePage.missing());
        coordinator.ensureHistory(session);
        verifyNoInteractions(validator);
        assertThat(repository.read("s", 0, 5000).text()).contains("原问题", "原答案", "original.png");
        assertThat(repository.gap("s")).contains("不能保证历史完整");
    }

    @Test
    void unlinkedNonConsultationSessionIsUnaffected() {
        when(policy.resolve("s", 7L)).thenReturn(Optional.empty());
        assertThat(coordinator.prepare(session, message)).isNull();
        verifyNoInteractions(validator, history);
    }

    @Test
    void aFinalSnapshotDoesNotEraseEarlierCommentaryOrSqlEvidence() {
        coordinator.delta("s", "turn", 0, "核对原SQL：SELECT original_rule", false);
        coordinator.delta("s", "turn", 1, "最终结论", true);
        assertThat(repository.read("s", 0, 5000).text()).contains("SELECT original_rule", "最终结论");
    }

    @Test
    void unreadableNativeFileStillAllowsSavedPlatformHistoryReading() {
        when(policy.savedHistory("s", 7L)).thenReturn(Optional.of("[{\"question\":\"已保存问题\",\"answer\":\"已保存答案\"}]"));
        when(history.readMessages("project", "native-A", "A", null, 100)).thenThrow(new IllegalStateException("file unavailable"));
        coordinator.ensureHistory(session);
        assertThat(repository.read("s", 0, 5000).text()).contains("已保存问题", "已保存答案");
        assertThat(repository.gap("s")).contains("无法读取");
        verifyNoInteractions(validator);
    }
}
