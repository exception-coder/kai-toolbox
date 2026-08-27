package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceProject;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceQuery;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceScope;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceScopeResolver;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceSourceType;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 动态规划、执行并登记跨项目规划证据。 */
@Service
public class PrdEvidenceOrchestrationService {

    public static final String TRACE_VERSION = "planning-evidence-trace-v2";
    public static final int MAX_ROUNDS = 3;

    private final ObjectProvider<ProjectEvidenceScopeResolver> scopeResolvers;
    private final PrdEvidencePlanService planService;
    private final PrdEvidenceCompletionGate completionGate;
    private final DomainKnowledgeQueryService domainKnowledge;
    private final GraphifyQueryService graphify;
    private final PrdDdlContextService ddlContext;
    private final PrdRouteContextService routeContext;
    private final PrdSourceContextService sourceContext;
    private final PrdTopologyContextService topologyContext;
    private final ObjectMapper mapper;

    public PrdEvidenceOrchestrationService(
            ObjectProvider<ProjectEvidenceScopeResolver> scopeResolvers,
            PrdEvidencePlanService planService,
            PrdEvidenceCompletionGate completionGate,
            DomainKnowledgeQueryService domainKnowledge,
            GraphifyQueryService graphify,
            PrdDdlContextService ddlContext,
            PrdRouteContextService routeContext,
            PrdSourceContextService sourceContext,
            PrdTopologyContextService topologyContext,
            ObjectMapper mapper
    ) {
        this.scopeResolvers = scopeResolvers;
        this.planService = planService;
        this.completionGate = completionGate;
        this.domainKnowledge = domainKnowledge;
        this.graphify = graphify;
        this.ddlContext = ddlContext;
        this.routeContext = routeContext;
        this.sourceContext = sourceContext;
        this.topologyContext = topologyContext;
        this.mapper = mapper;
    }

    /** 为初始化规格执行动态证据探索。 */
    public DiscoveryResult discover(PrdSession session) {
        return discover(new ProjectEvidenceQuery(
                session.getTitle(), session.getRawInput(), session.getProject(), session.getModule(),
                session.getEngine(), session.getModel()), "INITIAL_SPEC");
    }

    /** 为需求价值判定执行动态证据探索。 */
    public DiscoveryResult discover(ProjectEvidenceQuery query, String purpose) {
        ProjectEvidenceScope scope = resolver().resolve(query.project());
        String evidenceQuestion = ProjectEvidenceQuerySummary.build(query);
        List<PrdEvidencePlanService.PlanItem> dynamicPlan = planService.plan(
                query.title(), evidenceQuestion, query.module(), query.engine(), query.model(), scope);
        boolean hasActionUrl = value(query.description()).toLowerCase().contains(".action");
        List<PrdEvidencePlanService.PlanItem> plan = completionGate.completePlan(
                scope, dynamicPlan, hasActionUrl).stream()
                .sorted(planOrder(scope))
                .toList();
        ArrayList<LedgerEntry> entries = new ArrayList<>();
        PrdEvidenceCompletionGate.CompletionResult completion = completionGate.evaluate(plan, entries);
        int round = 1;
        while (!completion.complete() && round <= MAX_ROUNDS) {
            executeMissing(plan, entries, query, evidenceQuestion, scope);
            completion = completionGate.evaluate(plan, entries);
            if (completion.complete()) {
                break;
            }
            round++;
        }
        String traceId = UUID.randomUUID().toString();
        String traceJson = serializeTrace(traceId, scope, purpose, Math.min(round, MAX_ROUNDS), entries, completion);
        return new DiscoveryResult(
                traceId,
                traceJson,
                buildEvidenceText(entries),
                completion.complete(),
                completion.remainingGaps());
    }

    private void executeMissing(
            List<PrdEvidencePlanService.PlanItem> plan,
            List<LedgerEntry> entries,
            ProjectEvidenceQuery query,
            String evidenceQuestion,
            ProjectEvidenceScope scope
    ) {
        for (PrdEvidencePlanService.PlanItem item : plan) {
            boolean alreadyExecuted = entries.stream().anyMatch(entry ->
                    entry.sourceProject().equals(item.project().projectKey())
                            && entry.source() == item.sourceType());
            if (!alreadyExecuted) {
                entries.add(execute(item, query, evidenceQuestion, scope));
            }
        }
    }

    private LedgerEntry execute(
            PrdEvidencePlanService.PlanItem item,
            ProjectEvidenceQuery query,
            String evidenceQuestion,
            ProjectEvidenceScope scope
    ) {
        ProjectEvidenceProject project = item.project();
        ProjectEvidenceSourceType source = item.sourceType();
        String target = target(project, source);
        if (!project.availability().getOrDefault(source, false)) {
            return entry(item, target, true, "SOURCE_MISSING", "", null);
        }
        try {
            String result = switch (source) {
                case DOMAIN_KNOWLEDGE -> domainKnowledge.query(
                        project.projectKey(), query.module(), evidenceQuestion);
                case GRAPHIFY -> graphify.query(
                        project.projectPath(), query.module(), evidenceQuestion);
                case DDL -> ddlContext.query(
                        project.projectKey(), query.module(), evidenceQuestion, "");
                case ROUTE_MAP -> routeContext.query(project.projectKey(), query.description());
                case SOURCE -> sourceContext.query(
                        project.projectPath(), query.module(), evidenceQuestion);
                case CROSS_PROJECT_TOPOLOGY -> topologyContext.query(
                        scope.primary().projectKey(), project.projectKey(), evidenceQuestion);
            };
            String value = value(result);
            return entry(item, target, true, value.isBlank() ? "NO_HIT" : "HIT", value, null);
        } catch (RuntimeException error) {
            return entry(item, target, true, "EXECUTION_ERROR", "", bounded(message(error), 1_000));
        }
    }

    private String target(ProjectEvidenceProject project, ProjectEvidenceSourceType source) {
        return switch (source) {
            case DOMAIN_KNOWLEDGE -> domainKnowledge.traceTarget(project.projectKey());
            case GRAPHIFY -> graphify.traceTarget(project.projectPath(), null);
            case DDL -> ddlContext.traceTarget(project.projectKey());
            case ROUTE_MAP -> routeContext.traceTarget(project.projectKey());
            case SOURCE -> project.projectPath();
            case CROSS_PROJECT_TOPOLOGY -> topologyContext.traceTarget();
        };
    }

    private LedgerEntry entry(
            PrdEvidencePlanService.PlanItem item,
            String target,
            boolean attempted,
            String status,
            String result,
            String error
    ) {
        return new LedgerEntry(
                UUID.randomUUID().toString(), null, item.sourceType(), item.project().projectKey(),
                item.project().projectPath(), item.project().projectRole().name(),
                item.project().relation().name(), target, attempted, status, result.length(),
                item.queryReason(), bounded(result, 2_000), error, Instant.now().toString());
    }

    private String serializeTrace(
            String traceId,
            ProjectEvidenceScope scope,
            String purpose,
            int round,
            List<LedgerEntry> entries,
            PrdEvidenceCompletionGate.CompletionResult completion
    ) {
        Map<String, Object> trace = new HashMap<>(16);
        trace.put("version", TRACE_VERSION);
        trace.put("traceId", traceId);
        trace.put("scopeId", scope.scopeId());
        trace.put("primaryProject", scope.primary().projectKey());
        trace.put("purpose", purpose);
        trace.put("round", round);
        trace.put("maxRounds", MAX_ROUNDS);
        trace.put("complete", completion.complete());
        trace.put("sources", entries);
        trace.put("remainingGaps", completion.remainingGaps());
        try {
            return mapper.writeValueAsString(trace);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("序列化 planning-evidence-trace-v2 失败", error);
        }
    }

    private static String buildEvidenceText(List<LedgerEntry> entries) {
        StringBuilder result = new StringBuilder();
        for (LedgerEntry entry : entries) {
            result.append("\n\n## ").append(entry.sourceProject())
                    .append(" · ").append(entry.projectRole())
                    .append(" · ").append(entry.source())
                    .append(" · ").append(entry.status())
                    .append("\n目标：").append(value(entry.target()))
                    .append("\n查询原因：").append(entry.queryReason());
            if (entry.excerpt() != null && !entry.excerpt().isBlank()) {
                result.append("\n").append(entry.excerpt());
            }
            if (entry.errorSummary() != null && !entry.errorSummary().isBlank()) {
                result.append("\n错误：").append(entry.errorSummary());
            }
        }
        return result.toString().trim();
    }

    private ProjectEvidenceScopeResolver resolver() {
        ProjectEvidenceScopeResolver resolver = scopeResolvers.orderedStream().findFirst().orElse(null);
        if (resolver == null) {
            throw new IllegalStateException("resolve_project_evidence_scope 平台能力不可用");
        }
        return resolver;
    }

    private static Comparator<PrdEvidencePlanService.PlanItem> planOrder(ProjectEvidenceScope scope) {
        return Comparator
                .comparingInt((PrdEvidencePlanService.PlanItem item) -> scope.projects().indexOf(item.project()))
                .thenComparingInt(item -> sourceOrder(item.sourceType()));
    }

    private static int sourceOrder(ProjectEvidenceSourceType source) {
        return switch (source) {
            case DOMAIN_KNOWLEDGE -> 0;
            case GRAPHIFY -> 1;
            case SOURCE -> 2;
            case DDL -> 3;
            case ROUTE_MAP -> 4;
            case CROSS_PROJECT_TOPOLOGY -> 5;
        };
    }

    private static String message(Throwable error) {
        return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }

    private static String bounded(String value, int maxLength) {
        String text = value(value);
        return text.length() <= maxLength ? text : text.substring(0, maxLength);
    }

    private static String value(String value) {
        return value == null ? "" : value;
    }

    /**
     * @param traceId 证据轨迹标识
     * @param traceJson trace v2 JSON
     * @param evidenceText 按项目角色分栏的模型上下文
     * @param complete 服务端完成性
     * @param remainingGaps 残余缺口
     */
    public record DiscoveryResult(
            String traceId,
            String traceJson,
            String evidenceText,
            boolean complete,
            List<PrdEvidenceCompletionGate.Gap> remainingGaps
    ) {
    }

    /** planning-evidence-trace-v2 的不可变来源记录。 */
    public record LedgerEntry(
            String entryId,
            String retryOf,
            ProjectEvidenceSourceType source,
            String sourceProject,
            String projectPath,
            String projectRole,
            String relation,
            String target,
            boolean attempted,
            String status,
            int resultChars,
            String queryReason,
            String excerpt,
            String errorSummary,
            String createdAt
    ) {
    }
}
