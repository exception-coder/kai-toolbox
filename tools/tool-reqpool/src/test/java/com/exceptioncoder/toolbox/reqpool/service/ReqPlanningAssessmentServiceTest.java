package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import com.exceptioncoder.toolbox.reqpool.domain.ReqInsight;
import com.exceptioncoder.toolbox.reqpool.domain.ReqInsightType;
import com.exceptioncoder.toolbox.reqpool.domain.ReqPlanningAssessment;
import com.exceptioncoder.toolbox.reqpool.domain.ReqPlanningCommand;
import com.exceptioncoder.toolbox.reqpool.repository.ReqItemRepository;
import com.exceptioncoder.toolbox.reqpool.repository.ReqInsightRepository;
import com.exceptioncoder.toolbox.reqpool.repository.ReqPlanningAssessmentRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReqPlanningAssessmentServiceTest {

    @Test
    void freezesLatestInsightIntoTheCompositePlanningInput() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        ReqItemRepository itemRepository = mock(ReqItemRepository.class);
        ReqPlanningAssessmentRepository assessmentRepository = mock(ReqPlanningAssessmentRepository.class);
        ReqInsightRepository insightRepository = mock(ReqInsightRepository.class);
        ReqRequirementTypeService requirementTypeService = mock(ReqRequirementTypeService.class);
        ReqPlanningAssessmentService service = new ReqPlanningAssessmentService(
                runner, itemRepository, assessmentRepository, insightRepository,
                requirementTypeService, new ReqPlanningAssessmentNormalizer(new ObjectMapper()),
                new PlanningEvidenceTraceContext(new ObjectMapper()));
        ReqItem item = ReqItem.builder().id("item-1").title("需求").status("PRD_READY").build();
        ReqInsight insight = new ReqInsight(
                "insight-1", "item-1", ReqInsightType.ITEM, "req-item-v1", "source-hash",
                null, "{\"estimatedHours\":40}", "{\"version\":\"insight-trace\"}", "codex", null, 1L);
        ReqPlanningCommand command = new ReqPlanningCommand(
                "prd-1", "item-1", "需求", "原始输入", "kai-toolbox", "需求中枢",
                "MODULE_ADJUST", null, "codex", "# 初始化规格", null);
        when(itemRepository.findById("item-1")).thenReturn(Optional.of(item));
        when(itemRepository.findByPrdSessionId("prd-1")).thenReturn(Optional.empty());
        when(insightRepository.findLatestByItemId("item-1")).thenReturn(Optional.of(insight));
        when(assessmentRepository.findReusable(
                eq("prd-1"), anyString(), anyString())).thenReturn(Optional.empty());
        when(assessmentRepository.insert(org.mockito.ArgumentMatchers.any())).thenReturn(true);

        ReqPlanningAssessmentService.PreparedAssessment prepared = service.prepare(command);

        ArgumentCaptor<ReqPlanningAssessment> captured = ArgumentCaptor.forClass(ReqPlanningAssessment.class);
        verify(assessmentRepository).insert(captured.capture());
        assertThat(prepared.created()).isTrue();
        assertThat(captured.getValue().getSourceInsightId()).isEqualTo("insight-1");
        assertThat(captured.getValue().getSourceInsightSnapshot()).contains("estimatedHours");
        assertThat(captured.getValue().getEvidenceTraceJson()).contains("insight-trace");
        assertThat(captured.getValue().getInputHash()).hasSize(64);
    }

    @Test
    void repairsInvalidModelOutputWithinTheSameBackgroundRun() {
        Fixture fixture = fixture();
        when(fixture.runner.runOnce(anyString(), anyString(), isNull(), eq("codex")))
                .thenReturn(outputWithoutScope(), validOutput());
        when(fixture.assessmentRepository.complete(
                eq("assessment-1"), eq(validOutput()), anyString(), org.mockito.ArgumentMatchers.anyLong()))
                .thenReturn(true);

        fixture.service.execute("assessment-1");

        ArgumentCaptor<String> prompts = ArgumentCaptor.forClass(String.class);
        verify(fixture.runner, times(2)).runOnce(anyString(), prompts.capture(), isNull(), eq("codex"));
        assertThat(prompts.getAllValues().get(1))
                .contains("第 1 次输出未通过确定性校验")
                .contains("第 1 个领域功能的范围说明（scope）缺失")
                .contains("重新返回完整 JSON 根对象");
        assertThat(prompts.getAllValues().getFirst())
                .contains("【价值判定结论快照】")
                .contains("estimatedHours")
                .contains("正式工时");
        verify(fixture.assessmentRepository, never())
                .fail(anyString(), anyString(), org.mockito.ArgumentMatchers.anyLong());
    }

    @Test
    void recordsActionableFailureOnlyAfterThreeInvalidOutputs() {
        Fixture fixture = fixture();
        when(fixture.runner.runOnce(anyString(), anyString(), isNull(), eq("codex")))
                .thenReturn(outputWithoutScope());

        fixture.service.execute("assessment-1");

        ArgumentCaptor<String> error = ArgumentCaptor.forClass(String.class);
        verify(fixture.runner, times(3)).runOnce(anyString(), anyString(), isNull(), eq("codex"));
        verify(fixture.assessmentRepository).fail(
                eq("assessment-1"), error.capture(), org.mockito.ArgumentMatchers.anyLong());
        assertThat(error.getValue())
                .contains("系统已自动纠正 3 次仍未通过规划准则")
                .contains("第 1 个领域功能的范围说明（scope）缺失")
                .contains("可重新评估");
        verify(fixture.assessmentRepository, never())
                .complete(anyString(), anyString(), anyString(), org.mockito.ArgumentMatchers.anyLong());
    }

    @Test
    void repairsPlanningClaimsThatContradictRecordedEvidenceHits() {
        Fixture fixture = fixture();
        String contradictory = validOutput().replace(
                "按订单领域独立验收", "业务知识、代码图谱和数据库 DDL 均未命中，无法分析");
        when(fixture.runner.runOnce(anyString(), anyString(), isNull(), eq("codex")))
                .thenReturn(contradictory, validOutput());
        when(fixture.assessmentRepository.complete(
                eq("assessment-1"), eq(validOutput()), anyString(), org.mockito.ArgumentMatchers.anyLong()))
                .thenReturn(true);

        fixture.service.execute("assessment-1");

        ArgumentCaptor<String> prompts = ArgumentCaptor.forClass(String.class);
        verify(fixture.runner, times(2)).runOnce(anyString(), prompts.capture(), isNull(), eq("codex"));
        assertThat(prompts.getAllValues().getFirst())
                .contains("【证据路由与查询轨迹摘要】")
                .contains("当前实现 kai-toolbox")
                .contains("已命中")
                .doesNotContain("\"version\":\"planning-evidence-trace-v2\"");
        assertThat(prompts.getAllValues().get(1)).contains("规划结论与证据轨迹矛盾");
    }

    private static Fixture fixture() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        ReqItemRepository itemRepository = mock(ReqItemRepository.class);
        ReqPlanningAssessmentRepository assessmentRepository = mock(ReqPlanningAssessmentRepository.class);
        ReqInsightRepository insightRepository = mock(ReqInsightRepository.class);
        ReqRequirementTypeService requirementTypeService = mock(ReqRequirementTypeService.class);
        ReqPlanningAssessmentService service = new ReqPlanningAssessmentService(
                runner,
                itemRepository,
                assessmentRepository,
                insightRepository,
                requirementTypeService,
                new ReqPlanningAssessmentNormalizer(new ObjectMapper()),
                new PlanningEvidenceTraceContext(new ObjectMapper()));
        ReqPlanningAssessment assessment = ReqPlanningAssessment.builder()
                .id("assessment-1")
                .itemId("item-1")
                .prdSessionId("prd-1")
                .inputSnapshot("# 初始化规格")
                .sourceInsightId("insight-1")
                .sourceInsightHash("insight-hash")
                .sourceInsightSnapshot("{\"estimatedHours\":40,\"reason\":\"提升交付透明度\"}")
                .evidenceTraceJson(evidenceTrace())
                .status("RUNNING")
                .engine("codex")
                .build();
        ReqItem item = ReqItem.builder()
                .id("item-1")
                .title("合并需求")
                .project("kai-toolbox")
                .module("需求中枢")
                .build();
        when(assessmentRepository.findById("assessment-1")).thenReturn(Optional.of(assessment));
        when(itemRepository.findById("item-1")).thenReturn(Optional.of(item));
        return new Fixture(runner, assessmentRepository, service);
    }

    private static String outputWithoutScope() {
        return validOutput().replace("\"scope\":\"支持审核前主动取消\",", "");
    }

    private static String validOutput() {
        return """
                {
                  "summary":"按订单领域独立验收",
                  "assumptions":[],
                  "firstTestRelease":{
                    "scope":"先在测试环境验证审核前取消闭环",
                    "capabilityIds":["CAP-001"],
                    "acceptanceChecks":["取消结果可追溯"],
                    "deferredScope":[]
                  },
                  "capabilities":[{
                    "id":"CAP-001",
                    "domain":"订单",
                    "name":"审核前取消",
                    "businessOutcome":"减少人工撤单",
                    "scope":"支持审核前主动取消",
                    "specRefs":["REQ-001"],
                    "evidenceRefs":[],
                    "dependencies":[],
                    "risks":[],
                    "confidence":"HIGH",
                    "workPackages":[
                      {"type":"DISCOVERY_DESIGN","hoursMin":2,"hoursMax":3,"reason":"规则核对"},
                      {"type":"BACKEND","hoursMin":5,"hoursMax":8,"reason":"状态与接口"},
                      {"type":"FRONTEND","hoursMin":3,"hoursMax":5,"reason":"入口与反馈"},
                      {"type":"DATA","hoursMin":1,"hoursMax":2,"reason":"字段核验"},
                      {"type":"INTEGRATION","hoursMin":2,"hoursMax":2,"reason":"模块联调"},
                      {"type":"TEST_VERIFICATION","hoursMin":2,"hoursMax":3,"reason":"回归"}
                    ]
                  }]
                }
                """;
    }

    private static String evidenceTrace() {
        return """
                {"version":"planning-evidence-trace-v2","traceId":"trace-1","primaryProject":"kai-toolbox","sources":[
                  {"source":"GRAPHIFY","sourceProject":"kai-toolbox","projectRole":"CURRENT_IMPLEMENTATION","status":"HIT","excerpt":"ReqPlanningAssessmentService"},
                  {"source":"DDL","sourceProject":"kai-toolbox","projectRole":"CURRENT_IMPLEMENTATION","status":"HIT","excerpt":"req_planning_assessment"}
                ]}
                """;
    }

    private record Fixture(
            AgentOneShotRunner runner,
            ReqPlanningAssessmentRepository assessmentRepository,
            ReqPlanningAssessmentService service
    ) {
    }
}
