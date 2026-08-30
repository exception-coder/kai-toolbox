package com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 候选版本发布门禁结论。
 */
public record AgentReleaseGate(boolean releasable, double minimumScore, String reason) {

    /** 默认确定性评测发布阈值。 */
    public static final double DEFAULT_MINIMUM_SCORE = 95.0;

    /**
     * 根据候选版本的本地评测事实计算发布资格。
     *
     * @param candidate 候选版本
     * @return 发布门禁结论
     */
    public static AgentReleaseGate evaluate(AgentVersion candidate) {
        if (candidate == null) {
            return new AgentReleaseGate(false, DEFAULT_MINIMUM_SCORE, "请先保存 Candidate 配置");
        }
        if (candidate.evaluationRunId() == null || candidate.evaluationRunId().isBlank()) {
            return new AgentReleaseGate(false, DEFAULT_MINIMUM_SCORE, "Candidate 尚未关联确定性评测运行");
        }
        if (!candidate.evaluationPassed()) {
            return new AgentReleaseGate(false, DEFAULT_MINIMUM_SCORE, "Candidate 的确定性评测未通过");
        }
        if (candidate.evaluationScore() == null || candidate.evaluationScore() < DEFAULT_MINIMUM_SCORE) {
            return new AgentReleaseGate(false, DEFAULT_MINIMUM_SCORE,
                    "Candidate 评测分数需达到 " + DEFAULT_MINIMUM_SCORE);
        }
        String capabilityIssue = capabilityIssue(candidate, BusinessConsultCapabilityCatalog.byId());
        if (capabilityIssue != null) {
            return new AgentReleaseGate(false, DEFAULT_MINIMUM_SCORE, capabilityIssue);
        }
        return new AgentReleaseGate(true, DEFAULT_MINIMUM_SCORE, "评测与能力安全门禁已通过，可以发布");
    }

    private static String capabilityIssue(AgentVersion candidate, Map<String, AgentCapability> registry) {
        List<String> boundIds = new ArrayList<>();
        candidate.tools().forEach(name -> boundIds.add("tool:" + name));
        candidate.mcpServers().forEach(name -> boundIds.add("mcp:" + name));
        candidate.skills().forEach(name -> boundIds.add("skill:" + name));
        for (String id : boundIds) {
            AgentCapability capability = registry.get(id);
            if (capability == null) {
                return "存在未登记能力，无法发布: " + id;
            }
            if (!"REGISTERED".equals(capability.availability())) {
                return "能力当前不可用，无法发布: " + capability.name();
            }
            if ("TOOL".equals(capability.type()) && !"READ_ONLY".equals(capability.permission())) {
                return "业务咨询 Agent 仅允许绑定只读 Tool: " + capability.name();
            }
            if ("TOOL".equals(capability.type())
                    && !candidate.mcpServers().contains(capability.source())) {
                return "Tool 缺少提供方 MCP 绑定: " + capability.name() + " → " + capability.source();
            }
        }
        return null;
    }
}
