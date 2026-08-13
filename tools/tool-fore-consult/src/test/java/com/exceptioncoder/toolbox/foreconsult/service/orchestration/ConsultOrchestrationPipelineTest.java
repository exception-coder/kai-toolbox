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
                List.of("销售管理"), "BIZ", false), "v1");

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
                "按钮不见了", "ERP", "D:\\erp", List.of(), "IT", true), "v1");

        assertThat(result.steps()).extracting(ConsultOrchestrationResult.StepTrace::id)
                .containsExactly("security-boundary", "custom-diagnostic", "intent-and-clarification");
        assertThat(result.prompt()).contains("执行租户专属的只读诊断");
    }

    @Test
    void optimizedPipelineUsesMenuKnowledgeAndEvidenceGateWithoutClassicSteps() {
        ConsultStandardStepConfiguration classic = new ConsultStandardStepConfiguration();
        ConsultOptimizedStepConfiguration optimized = new ConsultOptimizedStepConfiguration();
        ConsultOrchestrationPipeline pipeline = new ConsultOrchestrationPipeline(List.of(
                classic.consultSecurityBoundaryStep(),
                optimized.consultV2SafetyAndScopeStep(),
                optimized.consultV2EvidencePlanStep(),
                optimized.consultV2MenuAndSourceStep(),
                optimized.consultV2RuntimeEvidenceStep(),
                optimized.consultV2EvidenceGateStep(),
                optimized.consultV2AnswerContractStep()));

        ConsultOrchestrationResult result = pipeline.orchestrate(new ConsultOrchestrationRequest(
                "标签打印在哪个菜单？", "yoooni", "D:\\yoooni",
                List.of("仓库管理"), "BIZ", false), "v2");

        assertThat(result.pipelineVersion()).isEqualTo("consult-orchestration-v2");
        assertThat(result.steps()).extracting(ConsultOrchestrationResult.StepTrace::id)
                .containsExactly(
                        "v2-safety-and-scope", "v2-evidence-plan", "v2-menu-and-source",
                        "v2-runtime-evidence", "v2-evidence-gate", "v2-answer-contract");
        assertThat(result.prompt())
                .contains("impl/modules.json")
                .contains("domain-knowledge.locate_menu")
                .contains("没有菜单证据时不得给出具体菜单")
                .contains("【业务员怎么操作】")
                .doesNotContain("产品文档、FAQ 与历史工单");
    }

    @Test
    void productionStandbyPipelineExtendsV2AndAddsSchemaGate() {
        ConsultOptimizedStepConfiguration optimized = new ConsultOptimizedStepConfiguration();
        ConsultProductionStandbyStepConfiguration production = new ConsultProductionStandbyStepConfiguration();
        ConsultOrchestrationPipeline pipeline = new ConsultOrchestrationPipeline(List.of(
                optimized.consultV2SafetyAndScopeStep(),
                optimized.consultV2EvidencePlanStep(),
                optimized.consultV2MenuAndSourceStep(),
                optimized.consultV2RuntimeEvidenceStep(),
                production.consultV3ProductionStandbySchemaStep(),
                optimized.consultV2EvidenceGateStep(),
                optimized.consultV2AnswerContractStep()));

        ConsultOrchestrationResult result = pipeline.orchestrate(new ConsultOrchestrationRequest(
                "给出生产备库查询订单的 SQL", "ERP", "D:\\yoooni",
                List.of("销售管理"), "IT", false), "v3");

        assertThat(result.pipelineVersion()).isEqualTo("consult-orchestration-v3");
        assertThat(result.steps()).extracting(ConsultOrchestrationResult.StepTrace::id)
                .containsExactly(
                        "v2-safety-and-scope", "v2-evidence-plan", "v2-menu-and-source",
                        "v2-runtime-evidence", "v3-erp-production-standby-schema",
                        "v2-evidence-gate", "v2-answer-contract");
        assertThat(result.prompt())
                .contains("erp_standby_validate_sql")
                .contains("TABLE 与 VIEW")
                .contains("名称相似只能作为候选")
                .contains("【业务员怎么操作】");

        ConsultOrchestrationResult v2Result = pipeline.orchestrate(new ConsultOrchestrationRequest(
                "给出测试库查询订单的 SQL", "ERP", "D:\\yoooni",
                List.of("销售管理"), "IT", false), "v2");
        assertThat(v2Result.steps()).extracting(ConsultOrchestrationResult.StepTrace::id)
                .doesNotContain("v3-erp-production-standby-schema");
    }

    @Test
    void evidenceAdaptivePipelineUsesIndependentGapDrivenEvidenceSteps() {
        ConsultStandardStepConfiguration classic = new ConsultStandardStepConfiguration();
        ConsultOptimizedStepConfiguration optimized = new ConsultOptimizedStepConfiguration();
        ConsultEvidenceAdaptiveStepConfiguration adaptive = new ConsultEvidenceAdaptiveStepConfiguration();
        ConsultOrchestrationPipeline pipeline = new ConsultOrchestrationPipeline(List.of(
                classic.consultSecurityBoundaryStep(),
                optimized.consultV2SafetyAndScopeStep(),
                adaptive.consultV4SafetyAndEvidencePlanStep(),
                adaptive.consultV4ModuleAndCoreSpecStep(),
                adaptive.consultV4ImplementationEvidenceStep(),
                adaptive.consultV4DdlAndRuntimeEvidenceStep(),
                adaptive.consultV4EvidenceConflictGateStep(),
                adaptive.consultV4AnswerContractStep()));

        ConsultOrchestrationResult result = pipeline.orchestrate(new ConsultOrchestrationRequest(
                "取消调回后匹号为什么不能再次入仓？", "ERP", "D:\\yoooni",
                List.of("仓库管理"), "BIZ", false), "v4");

        assertThat(result.pipelineVersion()).isEqualTo("consult-orchestration-v4");
        assertThat(result.steps()).extracting(ConsultOrchestrationResult.StepTrace::id)
                .containsExactly(
                        "v4-safety-and-evidence-plan", "v4-module-and-core-spec",
                        "v4-implementation-evidence", "v4-ddl-and-runtime-evidence",
                        "v4-evidence-conflict-gate", "v4-answer-contract");
        assertThat(result.prompt())
                .contains("requiredEvidence")
                .contains("impl/modules.json")
                .contains("businessTruth")
                .contains("get_module_core_spec")
                .contains("resolve_consult_context")
                .contains("先调用 domain-knowledge.resolve_consult_context")
                .contains("证据已经足以回答时立即停止")
                .contains("erp_standby_validate_sql")
                .contains("【明确结论】")
                .contains("<<<CONSULT_RECOGNITION>>>")
                .contains("MENU_OPERATION")
                .contains("recognitionStatus")
                .doesNotContain("v2 当前通过受控提示词");
        assertThat(result.capabilityGaps()).isEmpty();
    }

    @Test
    void evidenceAdaptivePipelineRoutesDatabaseEvidenceBySelectedSystem() {
        ConsultEvidenceAdaptiveStepConfiguration adaptive = new ConsultEvidenceAdaptiveStepConfiguration();
        ConsultOrchestrationPipeline pipeline = new ConsultOrchestrationPipeline(List.of(
                adaptive.consultV4DdlAndRuntimeEvidenceStep()));

        ConsultOrchestrationResult srmResult = pipeline.orchestrate(new ConsultOrchestrationRequest(
                "查询款号最近一个月采购量", "srm-system", "D:\\srm-system",
                List.of(), "BIZ", false), "v4");
        assertThat(srmResult.prompt())
                .contains("当前目标系统是 SRM")
                .contains("consult-readonly.srm_db_query")
                .contains("information_schema")
                .doesNotContain("erp_standby_validate_sql")
                .doesNotContain("erp_standby_schema_search");

        ConsultOrchestrationResult erpResult = pipeline.orchestrate(new ConsultOrchestrationRequest(
                "生成生产备库查询 SQL", "yoooni", "D:\\yoooni",
                List.of(), "IT", false), "v4");
        assertThat(erpResult.prompt())
                .contains("当前目标系统是 ERP")
                .contains("consult-readonly.erp_db_query")
                .contains("consult-readonly.erp_standby_validate_sql")
                .doesNotContain("consult-readonly.srm_db_query");

        ConsultOrchestrationResult unknownResult = pipeline.orchestrate(new ConsultOrchestrationRequest(
                "查询运行数据", "unknown-system", "D:\\unknown-system",
                List.of(), "IT", false), "v4");
        assertThat(unknownResult.prompt())
                .contains("尚未映射专用数据库工具")
                .doesNotContain("consult-readonly.erp_db_query")
                .doesNotContain("consult-readonly.srm_db_query")
                .doesNotContain("consult-readonly.scm_db_query");
    }

    @Test
    void defaultOrchestrationUsesV4() {
        ConsultEvidenceAdaptiveStepConfiguration adaptive = new ConsultEvidenceAdaptiveStepConfiguration();
        ConsultOrchestrationPipeline pipeline = new ConsultOrchestrationPipeline(List.of(
                adaptive.consultV4SafetyAndEvidencePlanStep()));

        ConsultOrchestrationResult result = pipeline.orchestrate(new ConsultOrchestrationRequest(
                "Why is the receipt missing?", "ERP", "D:\\yoooni", List.of(), "BIZ", false));

        assertThat(result.pipelineVersion()).isEqualTo("consult-orchestration-v4");
        assertThat(result.steps()).extracting(ConsultOrchestrationResult.StepTrace::id)
                .containsExactly("v4-safety-and-evidence-plan");
    }

    @Test
    void versionNormalizationDefaultsToV4AndPreservesExplicitLegacyVersions() {
        assertThat(ConsultOrchestrationPipeline.normalizeVersion("V4")).isEqualTo("v4");
        assertThat(ConsultOrchestrationPipeline.normalizeVersion("v3")).isEqualTo("v3");
        assertThat(ConsultOrchestrationPipeline.normalizeVersion("v2")).isEqualTo("v2");
        assertThat(ConsultOrchestrationPipeline.normalizeVersion("v1")).isEqualTo("v1");
        assertThat(ConsultOrchestrationPipeline.normalizeVersion("unknown")).isEqualTo("v4");
        assertThat(ConsultOrchestrationPipeline.normalizeVersion(" ")).isEqualTo("v4");
        assertThat(ConsultOrchestrationPipeline.normalizeVersion(null)).isEqualTo("v4");
    }
}
