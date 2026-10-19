package com.exceptioncoder.toolbox.claudechat.workassistants.planning;

import com.exceptioncoder.toolbox.claudechat.workassistants.AssistantEvidence;
import com.exceptioncoder.toolbox.common.project.ProjectCatalog;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class WeeklyRequestPlannerTest {
    private final AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
    private final AssistantEvidence evidence = mock(AssistantEvidence.class);
    private WeeklyRequestPlanner planner;

    @BeforeEach void setup() {
        when(runner.supportedEngines()).thenReturn(Set.of("codex"));
        when(evidence.projects()).thenReturn(List.of(new ProjectCatalog.Entry("erp", "system", "ERP", "/erp", "/", true, false, "registry")));
        planner = new WeeklyRequestPlanner(runner, new ObjectMapper(), evidence,
                Clock.fixed(Instant.parse("2026-10-19T16:30:00Z"), ZoneId.of("Asia/Shanghai")));
    }

    @Test void resolvesNaturalRequestWithDeterministicShanghaiCalendarAndNoTools() {
        when(runner.runOnce(any(AgentOneShotRunner.ExecutionRequest.class))).thenAnswer(invocation -> {
            AgentOneShotRunner.ExecutionRequest request = invocation.getArgument(0);
            assertThat(request.toolPolicy()).isEqualTo("disabled");
            assertThat(request.userPrompt()).contains("2026-10-20", "看看我上周张凯的提交");
            return "{\"author\":\"张凯\",\"period\":\"PREVIOUS_WEEK\"}";
        });
        var result = planner.resolve(new WeeklyRequestPlanner.Request(List.of("erp"), "看看我上周张凯的提交", "codex", ""));
        assertThat(result.scope()).isEqualTo(new AssistantEvidence.Scope(List.of("erp"), "2026-10-12", "2026-10-18", "张凯"));
        verify(evidence, never()).collect(any(), any());
    }

    @Test void asksInsteadOfInventingAnAuthorAndRejectsInvalidModelDates() {
        when(runner.runOnce(any(AgentOneShotRunner.ExecutionRequest.class))).thenReturn("{\"author\":\"张凯\",\"period\":\"THIS_WEEK\"}");
        assertThat(planner.resolve(new WeeklyRequestPlanner.Request(List.of("erp"), "整理我的周报", "codex", "")).scope()).isNull();
        when(runner.runOnce(any(AgentOneShotRunner.ExecutionRequest.class))).thenReturn("{\"author\":\"张凯\",\"period\":\"LAST_N_DAYS\",\"days\":100}");
        assertThat(planner.resolve(new WeeklyRequestPlanner.Request(List.of("erp"), "张凯最近100天", "codex", "")).scope()).isNull();
    }

    @Test void rejectsCredentialsAndExcludedProjectsBeforeInvokingAnEngine() {
        assertThatThrownBy(() -> planner.resolve(new WeeklyRequestPlanner.Request(List.of("erp"), "password=secret", "codex", ""))).hasMessageContaining("凭据");
        assertThatThrownBy(() -> planner.resolve(new WeeklyRequestPlanner.Request(List.of("other"), "上周张凯", "codex", ""))).hasMessageContaining("不可用");
        verify(runner, never()).runOnce(any(AgentOneShotRunner.ExecutionRequest.class));
    }
}
