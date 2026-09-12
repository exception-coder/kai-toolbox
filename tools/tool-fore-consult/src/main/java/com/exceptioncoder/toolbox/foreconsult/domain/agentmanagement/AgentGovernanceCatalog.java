package com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement;

import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingConfig;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingScenario;
import java.util.List;

/** 按稳定 Agent 标识解析治理能力和回归数据。 */
public final class AgentGovernanceCatalog {

    public static final String BUSINESS_CONSULT = "business-consult";
    public static final String REQUIREMENT_SPECIFICATION = "requirement-specification";
    public static final String REQUIREMENT_PROGRESS = "requirement-progress";

    private AgentGovernanceCatalog() {
    }

    public static List<AgentCapability> capabilities(String agentId) {
        return switch (agentId) {
            case TeachingConfig.AGENT_ID -> List.of(
                    new AgentCapability("tool:lookup_sku", "lookup_sku", "TOOL", "v1", "mock-erp",
                            "查询模拟 ERP 款号，不访问真实业务系统", "READ_ONLY", "LOW", "REGISTERED",
                            "内置 Java 只读工具", List.of()),
                    new AgentCapability("tool:propose_draft", "propose_draft", "TOOL", "v1", "java",
                            "提议并校验未提交的订单草稿", "READ_ONLY", "LOW", "REGISTERED",
                            "确定性数量与款号校验", List.of()));
            case REQUIREMENT_SPECIFICATION -> RequirementSpecificationCapabilityCatalog.capabilities();
            case REQUIREMENT_PROGRESS -> RequirementProgressCapabilityCatalog.capabilities();
            case BUSINESS_CONSULT -> BusinessConsultCapabilityCatalog.capabilities();
            default -> throw new IllegalArgumentException("未登记的 Agent: " + agentId);
        };
    }

    public static AgentEvaluationDataset evaluationDataset(String agentId,
                                                            AgentEvaluationDataset businessConsultDataset) {
        return switch (agentId) {
            case TeachingConfig.AGENT_ID -> new AgentEvaluationDataset("order-draft-v1", "订单草稿教学回归",
                    "TEACHING_BASELINE", TeachingScenario.all()
                    .stream().map(item -> new AgentEvaluationCase(item.id(), item.title(), item.input(),
                            item.expectedStatus(), "READY")).toList());
            case REQUIREMENT_SPECIFICATION -> RequirementSpecificationCapabilityCatalog.evaluationDataset();
            case REQUIREMENT_PROGRESS -> RequirementProgressCapabilityCatalog.evaluationDataset();
            case BUSINESS_CONSULT -> businessConsultDataset;
            default -> throw new IllegalArgumentException("未登记的 Agent: " + agentId);
        };
    }
}
