package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import com.exceptioncoder.toolbox.reqpool.domain.ReqPlanningAssessment;
import com.exceptioncoder.toolbox.reqpool.repository.ReqItemRepository;
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

    private static Fixture fixture() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        ReqItemRepository itemRepository = mock(ReqItemRepository.class);
        ReqPlanningAssessmentRepository assessmentRepository = mock(ReqPlanningAssessmentRepository.class);
        ReqRequirementTypeService requirementTypeService = mock(ReqRequirementTypeService.class);
        ReqPlanningAssessmentService service = new ReqPlanningAssessmentService(
                runner,
                itemRepository,
                assessmentRepository,
                requirementTypeService,
                new ReqPlanningAssessmentNormalizer(new ObjectMapper()));
        ReqPlanningAssessment assessment = ReqPlanningAssessment.builder()
                .id("assessment-1")
                .itemId("item-1")
                .prdSessionId("prd-1")
                .inputSnapshot("# 初始化规格")
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

    private record Fixture(
            AgentOneShotRunner runner,
            ReqPlanningAssessmentRepository assessmentRepository,
            ReqPlanningAssessmentService service
    ) {
    }
}
