package com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement;

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
            case REQUIREMENT_SPECIFICATION -> RequirementSpecificationCapabilityCatalog.capabilities();
            case REQUIREMENT_PROGRESS -> RequirementProgressCapabilityCatalog.capabilities();
            case BUSINESS_CONSULT -> BusinessConsultCapabilityCatalog.capabilities();
            default -> throw new IllegalArgumentException("未登记的 Agent: " + agentId);
        };
    }

    public static AgentEvaluationDataset evaluationDataset(String agentId,
                                                            AgentEvaluationDataset businessConsultDataset) {
        return switch (agentId) {
            case REQUIREMENT_SPECIFICATION -> RequirementSpecificationCapabilityCatalog.evaluationDataset();
            case REQUIREMENT_PROGRESS -> RequirementProgressCapabilityCatalog.evaluationDataset();
            case BUSINESS_CONSULT -> businessConsultDataset;
            default -> throw new IllegalArgumentException("未登记的 Agent: " + agentId);
        };
    }
}
