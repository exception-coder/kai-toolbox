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
    void repeatClickUsesOnlyThePreviousDispatchedQuestionOfThisConsultation() {
        selected("A", 1);
        String target = "使用浏览器打开 https://example.com，点击 Learn more，返回跳转地址。";
        String retry = "你尝试点击一下对应站点的菜单按钮 看看是否可以点击";
        var direct = new ClientMessage.Send(target, List.of(), null, null, "one");
        var followUp = new ClientMessage.Send(retry, List.of(), null, null, "two");
        var plan = coordinator.prepare(session, direct);
        assertThat(plan.browserInput()).isEqualTo(new ConsultRuntimeCoordinator.BrowserInput(target, null, null));
        coordinator.dispatched("s", "one", "turn-one", direct, plan);
        coordinator.initialized(plan, "native-A");
        repository.append("other", "another:user", "user", "打开 https://other.example.org", true);
        coordinator.delta("s", "turn-one", "打开 https://assistant.example.org", false);
        assertThat(coordinator.prepare(session, followUp).browserInput())
                .isEqualTo(new ConsultRuntimeCoordinator.BrowserInput(retry, target, null));
        assertThat(coordinator.prepare(session, message).browserInput()).isNull();
        repository.append("s", "unrelated:user", "user", "查库存", true);
        assertThat(coordinator.prepare(session, followUp).browserInput()).isNull();
    }

    @Test
    void followsTheSuccessfulManagedPageAcrossFailedAttemptsOnlyInItsOriginalSegment() throws Exception {
        selected("A", 1);
        String current = "https://www.iana.org/help/example-domains";
        var open = new ClientMessage.Send("打开 https://example.com，点击 Learn more", List.of(), null, null, "open");
        var click = new ClientMessage.Send("再点击 IANA 页顶部的“Domains”菜单", List.of(), null, null, "follow");
        var first = coordinator.prepare(session, open);
        coordinator.dispatched("s", "open", "t1", open, first);
        coordinator.initialized(first, "native-A");
        var mapper = new ObjectMapper();
        var page = java.util.Map.of("url", current, "beforeUrl", "https://example.com/", "afterUrl", current, "status", 200);
        String output = mapper.writeValueAsString(java.util.Map.of("content", List.of(
                java.util.Map.of("type", "text", "text", mapper.writeValueAsString(page)))));
        repository.importMessage("other", ChatMessageView.tool("t1:tool:1", "forge_browser/browser_open_and_click", null, output, false, 1L));
        assertThat(coordinator.prepare(session, click).browserInput()).isNull();
        coordinator.tool("s", ChatMessageView.tool("t1:tool:1", "forge_browser/browser_open_and_click", null, output, false, 1L));
        assertThat(coordinator.prepare(session, click).browserInput().currentPageUrl()).isEqualTo(current);
        var repeat = new ClientMessage.Send("再点一次刚才的链接", List.of(), null, null, "repeat");
        assertThat(coordinator.prepare(session, repeat).browserInput().previousUserRequest()).isEqualTo(open.text());
        var changedSite = new ClientMessage.Send("打开 https://another.example，点击 导航", List.of(), null, null, "new");
        assertThat(coordinator.prepare(session, changedSite).browserInput().currentPageUrl()).isNull();

        var retry = new ClientMessage.Send("你尝试点击一下对应站点的菜单按钮 看看是否可以点击", List.of(), null, null, "retry");
        var retryPlan = coordinator.prepare(session, retry);
        coordinator.dispatched("s", "retry", "t2", retry, retryPlan);
        coordinator.tool("s", ChatMessageView.tool("t2:tool:native", "cua_repl/js", null, "host unavailable", true, 2L));
        assertThat(coordinator.prepare(session, click).browserInput().currentPageUrl()).isEqualTo(current);
        var approval = new ClientMessage.Send("授权你执行", List.of(), null, null, "approval");
        assertThat(coordinator.prepare(session, approval).browserInput()).isNull();
        selected("B", 2);
        assertThat(coordinator.prepare(session, click).browserInput()).isNull();
        selected("A", 1);
        coordinator.tool("s", ChatMessageView.tool("t2:tool:fake", "shell", null, output, false, 2L));
        assertThat(coordinator.prepare(session, click).browserInput()).isNull();
        repository.importMessage("s", ChatMessageView.tool("imported", "forge_browser/browser_open_and_click", null, output, false, 3L));
        assertThat(coordinator.prepare(session, click).browserInput()).isNull();
    }

    @Test
    void importedNativeHistoryAndDeveloperPromptsCannotAuthorizeABrowserClick() {
        String target = "打开 https://example.com，点击 Learn more";
        coordinator.ensureHistory(session);
        repository.importMessage("s", ChatMessageView.user("imported", target, 3L));
        var retry = new ClientMessage.Send("请点击刚才的链接", List.of(), target, null, "retry");
        assertThat(coordinator.prepare(session, retry).browserInput()).isNull();
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
