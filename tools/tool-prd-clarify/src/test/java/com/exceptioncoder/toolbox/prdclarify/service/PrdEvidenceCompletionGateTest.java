package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceProject;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceRelation;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceRole;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceScope;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceSourceType;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class PrdEvidenceCompletionGateTest {

    private final PrdEvidenceCompletionGate gate = new PrdEvidenceCompletionGate();

    @Test
    void requiresLegacyEvidenceForRefactorRelationship() {
        ProjectEvidenceProject primary = project("yoooni-one", ProjectEvidenceRelation.PRIMARY,
                ProjectEvidenceRole.CURRENT_IMPLEMENTATION);
        ProjectEvidenceProject legacy = project("yoooni", ProjectEvidenceRelation.REFACTORS,
                ProjectEvidenceRole.LEGACY_SOURCE);

        List<PrdEvidencePlanService.PlanItem> plan = gate.completePlan(
                new ProjectEvidenceScope("scope-1", primary, List.of(legacy)), List.of(), false);

        assertThat(plan).extracting(item -> item.project().projectKey() + ":" + item.sourceType())
                .contains(
                        "yoooni-one:DOMAIN_KNOWLEDGE",
                        "yoooni-one:GRAPHIFY",
                        "yoooni-one:SOURCE",
                        "yoooni:DOMAIN_KNOWLEDGE",
                        "yoooni:GRAPHIFY",
                        "yoooni:DDL",
                        "yoooni:SOURCE",
                        "yoooni:CROSS_PROJECT_TOPOLOGY");
    }

    @Test
    void treatsExecutedNoHitAsAuditableCompletion() {
        ProjectEvidenceProject primary = project("yoooni-one", ProjectEvidenceRelation.PRIMARY,
                ProjectEvidenceRole.CURRENT_IMPLEMENTATION);
        List<PrdEvidencePlanService.PlanItem> plan = List.of(new PrdEvidencePlanService.PlanItem(
                primary, ProjectEvidenceSourceType.GRAPHIFY, "检查当前实现"));
        PrdEvidenceOrchestrationService.LedgerEntry entry = new PrdEvidenceOrchestrationService.LedgerEntry(
                "entry-1", null, ProjectEvidenceSourceType.GRAPHIFY, "yoooni-one", "D:/repo",
                "CURRENT_IMPLEMENTATION", "PRIMARY", "D:/repo/graphify-out", true,
                "NO_HIT", 0, "检查当前实现", "", null, "2026-08-23T00:00:00Z");

        assertThat(gate.evaluate(plan, List.of(entry)).complete()).isTrue();
        assertThat(gate.evaluate(plan, List.of()).remainingGaps()).hasSize(1);
    }

    private static ProjectEvidenceProject project(
            String key,
            ProjectEvidenceRelation relation,
            ProjectEvidenceRole role
    ) {
        return new ProjectEvidenceProject(key, "D:/" + key, relation, role,
                Map.of(ProjectEvidenceSourceType.SOURCE, true));
    }
}
