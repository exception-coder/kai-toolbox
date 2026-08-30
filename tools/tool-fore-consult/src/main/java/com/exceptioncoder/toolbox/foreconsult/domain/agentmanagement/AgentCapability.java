package com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement;

import java.util.List;

/**
 * 可被 Agent 绑定的受治理能力定义；描述能力契约，不代表其进程运行状态。
 */
public record AgentCapability(
        String id,
        String name,
        String type,
        String version,
        String source,
        String description,
        String permission,
        String riskLevel,
        String availability,
        String availabilityBasis,
        List<String> providedCapabilityIds
) {
}
