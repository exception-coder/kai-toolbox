package com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement;

import java.util.List;

/**
 * 业务咨询 Agent 管理页面所需的聚合快照。
 */
public record AgentManagementSnapshot(
        String id,
        String name,
        String owner,
        String description,
        String endpoint,
        String framework,
        String observabilityUrl,
        AgentVersion productionVersion,
        AgentVersion candidateVersion,
        List<AgentVersion> versions,
        List<AgentCapability> capabilityRegistry,
        List<String> productionCapabilityIds,
        List<String> candidateCapabilityIds,
        AgentEvaluationDataset evaluationDataset,
        AgentReleaseGate releaseGate
) {
}
