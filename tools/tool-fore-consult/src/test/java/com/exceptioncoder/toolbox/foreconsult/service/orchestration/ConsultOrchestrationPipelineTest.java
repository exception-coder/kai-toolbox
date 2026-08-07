package com.exceptioncoder.toolbox.foreconsult.service.orchestration;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ConsultOrchestrationPipelineTest {

    @Test
    void standardPipelineMakesEvidenceBoundaryAndAntiLoopPolicyExplicit() {
        ConsultStandardStepConfiguration configuration = new ConsultStandardStepConfiguration();
        ConsultOrchestrationPipeline pipeline = new ConsultOrchestrationPipeline(List.of(
                configuration.consultHandoffLearningStep(),
                configuration.consultAnswerStep(),
                configuration.consultCandidateReasonStep(),
                configuration.consultEvidenceRetrievalStep(),
                configuration.consultEnvironmentContextStep(),
                configuration.consultBusinessMappingStep(),
                configuration.consultIntentClarificationStep(),
                configuration.consultSecurityBoundaryStep()));

        ConsultOrchestrationResult result = pipeline.orchestrate(new ConsultOrchestrationRequest(
                "销售订单已提交后为什么不能修改？", "ERP", "D:\\erp",
                List.of("销售管理"), "BIZ", false));

        assertThat(result.pipelineVersion()).isEqualTo("consult-orchestration-v1");
        assertThat(result.steps()).extracting(ConsultOrchestrationResult.StepTrace::id)
                .containsExactly(
                        "security-boundary", "intent-and-clarification", "business-mapping",
                        "environment-context", "evidence-retrieval", "candidate-reasons",
                        "answer-and-verification", "handoff-and-learning");
        assertThat(result.prompt())
                .contains("同一信息最多追问一次")
                .contains("不知道/不会看/找不到")
                .contains("当前未连接生产数据库和日志")
                .contains("静态代码只能证明")
                .contains("已确认＝")
                .contains("可以在回答中生成完整 DDL/DML SQL")
                .contains("forge.register_pending_sql")
                .contains("脱离应用正常运行")
                .contains("Repository、JDBC、MyBatis、ORM")
                .contains("测试夹具")
                .contains("具体系统或模块的业务功能")
                .contains("-- 功能：...；变更：...；目的：...")
                .contains("不能因此拒绝回答")
                .contains("不得亲自执行变更 SQL")
                .contains("不得声称已经创建外部工单")
                .contains("业务员场景保持简短")
                .contains("销售订单已提交后为什么不能修改？");
        assertThat(result.capabilityGaps())
                .contains("尚未自动识别部署版本、租户、功能开关和用户角色权限")
                .contains("未连接生产数据库和生产日志")
                .contains("尚未连接外部工单/人工支持系统");
    }

    @Test
    void customStepCanBeInsertedWithoutChangingPipelineCode() {
        ConsultOrchestrationStep custom = new ConsultOrchestrationStep() {
            @Override public String id() { return "custom-diagnostic"; }
            @Override public String label() { return "自定义诊断"; }
            @Override public int order() { return 150; }
            @Override public ConsultStepAvailability availability() { return ConsultStepAvailability.AVAILABLE; }
            @Override public void apply(ConsultOrchestrationContext context) {
                context.addSection("自定义诊断", "执行租户专属的只读诊断。");
            }
        };
        ConsultStandardStepConfiguration configuration = new ConsultStandardStepConfiguration();
        ConsultOrchestrationPipeline pipeline = new ConsultOrchestrationPipeline(List.of(
                configuration.consultSecurityBoundaryStep(), custom,
                configuration.consultIntentClarificationStep()));

        ConsultOrchestrationResult result = pipeline.orchestrate(new ConsultOrchestrationRequest(
                "按钮不见了", "ERP", "D:\\erp", List.of(), "IT", true));

        assertThat(result.steps()).extracting(ConsultOrchestrationResult.StepTrace::id)
                .containsExactly("security-boundary", "custom-diagnostic", "intent-and-clarification");
        assertThat(result.prompt()).contains("执行租户专属的只读诊断");
    }
}
