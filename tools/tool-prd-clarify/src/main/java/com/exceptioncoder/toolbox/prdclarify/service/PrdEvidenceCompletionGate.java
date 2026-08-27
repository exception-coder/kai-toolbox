package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceProject;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceRelation;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceScope;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceSourceType;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 以项目关系为准补齐必查证据并裁决 ledger 完成性。 */
@Service
public class PrdEvidenceCompletionGate {

    /** 合并 Agent 动态计划和服务端关系门禁规定的必查项。 */
    public List<PrdEvidencePlanService.PlanItem> completePlan(
            ProjectEvidenceScope scope,
            List<PrdEvidencePlanService.PlanItem> dynamicPlan,
            boolean hasActionUrl
    ) {
        Map<String, PrdEvidencePlanService.PlanItem> unique = new LinkedHashMap<>();
        dynamicPlan.forEach(item -> unique.put(key(item.project(), item.sourceType()), item));
        for (ProjectEvidenceProject project : scope.projects()) {
            for (ProjectEvidenceSourceType source : requiredSources(project.relation())) {
                String reason = "关系 " + project.relation() + " 的服务端必查来源";
                unique.putIfAbsent(key(project, source), new PrdEvidencePlanService.PlanItem(project, source, reason));
            }
            if (hasActionUrl && (project.relation() == ProjectEvidenceRelation.PRIMARY
                    || project.relation() == ProjectEvidenceRelation.REFACTORS
                    || project.relation() == ProjectEvidenceRelation.MIGRATES_FROM)) {
                unique.putIfAbsent(key(project, ProjectEvidenceSourceType.ROUTE_MAP),
                        new PrdEvidencePlanService.PlanItem(project, ProjectEvidenceSourceType.ROUTE_MAP,
                                "需求包含 action URL，需要核验入口映射"));
            }
        }
        return List.copyOf(unique.values());
    }

    /** 检查必查计划是否都有真实 ledger entry。 */
    public CompletionResult evaluate(
            List<PrdEvidencePlanService.PlanItem> plan,
            List<PrdEvidenceOrchestrationService.LedgerEntry> entries
    ) {
        ArrayList<Gap> gaps = new ArrayList<>();
        for (PrdEvidencePlanService.PlanItem item : plan) {
            boolean present = entries.stream().anyMatch(entry ->
                    entry.sourceProject().equals(item.project().projectKey())
                            && entry.source() == item.sourceType());
            if (!present) {
                gaps.add(new Gap(item.project().projectKey(), item.sourceType(), "必查来源没有 ledger entry"));
            }
        }
        return new CompletionResult(gaps.isEmpty(), List.copyOf(gaps));
    }

    private static List<ProjectEvidenceSourceType> requiredSources(ProjectEvidenceRelation relation) {
        return switch (relation) {
            case PRIMARY -> List.of(
                    ProjectEvidenceSourceType.DOMAIN_KNOWLEDGE,
                    ProjectEvidenceSourceType.GRAPHIFY,
                    ProjectEvidenceSourceType.SOURCE);
            case REFACTORS -> List.of(
                    ProjectEvidenceSourceType.DOMAIN_KNOWLEDGE,
                    ProjectEvidenceSourceType.GRAPHIFY,
                    ProjectEvidenceSourceType.DDL,
                    ProjectEvidenceSourceType.SOURCE,
                    ProjectEvidenceSourceType.CROSS_PROJECT_TOPOLOGY);
            case MIGRATES_FROM -> List.of(
                    ProjectEvidenceSourceType.DOMAIN_KNOWLEDGE,
                    ProjectEvidenceSourceType.GRAPHIFY,
                    ProjectEvidenceSourceType.DDL,
                    ProjectEvidenceSourceType.SOURCE);
            case DEPENDS_ON, INTEGRATES_WITH -> List.of();
        };
    }

    private static String key(ProjectEvidenceProject project, ProjectEvidenceSourceType source) {
        return project.projectKey() + ':' + source;
    }

    /**
     * @param complete 是否完成
     * @param remainingGaps 残余漏查项
     */
    public record CompletionResult(boolean complete, List<Gap> remainingGaps) {
    }

    /**
     * @param projectKey 项目键
     * @param sourceType 缺失来源
     * @param reason 缺失原因
     */
    public record Gap(String projectKey, ProjectEvidenceSourceType sourceType, String reason) {
    }
}
