package com.exceptioncoder.toolbox.reqpool.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 将多项目证据轨迹转换为有界上下文，并校验模型结论与实际调用是否一致。 */
@Component
public class PlanningEvidenceTraceContext {

    private static final int MAX_EXCERPT_CHARS = 600;
    private static final int MAX_PROMPT_CHARS = 8_000;
    private static final Map<String, String> SOURCE_LABELS = Map.of(
            "DOMAIN_KNOWLEDGE", "业务知识",
            "GRAPHIFY", "代码图谱",
            "DDL", "数据库 DDL",
            "ROUTE_MAP", "路由映射",
            "SOURCE", "源码事实",
            "CROSS_PROJECT_TOPOLOGY", "跨项目拓扑");

    private final ObjectMapper mapper;

    public PlanningEvidenceTraceContext(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /** 生成供模型使用的角色摘要和有限命中摘录，不传递整份轨迹 JSON。 */
    public String promptContext(String traceJson) {
        EvidenceFacts facts = parse(traceJson);
        if (!facts.valid()) {
            return "历史任务未记录可解析的证据调用轨迹，不能判断数据源缺失还是未执行查询。";
        }
        StringBuilder text = new StringBuilder();
        text.append("轨迹 ").append(facts.traceId()).append("，主项目 ")
                .append(facts.primaryProject()).append("。\n");
        for (ProjectFacts project : facts.projects()) {
            text.append("- ").append(roleLabel(project.role())).append(' ')
                    .append(project.project()).append("：");
            appendStatuses(text, "已命中", project.hitSources());
            appendStatuses(text, "已查询未命中", project.noHitSources());
            appendStatuses(text, "数据源缺失", project.missingSources());
            appendStatuses(text, "调用异常", project.errorSources());
            text.append('\n');
        }
        if (facts.hasLegacyHit() && facts.currentHasGap()) {
            text.append("结论约束：当前实现项目存在证据缺口，但遗留/关联项目已有命中；"
                    + "应将命中内容作为迁移与复用依据，把当前缺口写成待实现或待核验风险，禁止概括为全局无法分析。\n");
        } else if (facts.hasAnyHit()) {
            text.append("结论约束：已有来源命中，禁止声称所有业务知识、代码图谱、DDL 或路由均未命中。\n");
        }
        for (EvidenceHit hit : facts.hits()) {
            text.append("\n【").append(hit.project()).append(" · ")
                    .append(sourceLabel(hit.source())).append(" · 已命中】\n")
                    .append(bounded(hit.excerpt(), MAX_EXCERPT_CHARS));
        }
        return bounded(text.toString().trim(), MAX_PROMPT_CHARS);
    }

    /** 已有命中时拒绝模型生成与调用轨迹矛盾的全局缺失结论。 */
    public void validateClaims(String normalizedPayload, String traceJson) {
        EvidenceFacts facts = parse(traceJson);
        if (!facts.hasAnyHit() || normalizedPayload == null || normalizedPayload.isBlank()) {
            return;
        }
        String text = normalizedPayload.replace("\\n", "\n");
        if (text.contains("未记录证据调用轨迹") || text.contains("无法反推是知识缺失还是未成功查询")) {
            throw new IllegalArgumentException("规划结论与证据轨迹矛盾：本次运行已经记录并命中证据来源");
        }
        for (String sentence : text.split("[。；\\n]")) {
            if (!containsNegativeClaim(sentence) || isExplicitlyRoleScoped(sentence, facts.primaryProject())) {
                continue;
            }
            long mentionedHits = facts.hitSourceTypes().stream()
                    .map(PlanningEvidenceTraceContext::sourceLabel)
                    .filter(sentence::contains)
                    .count();
            if (mentionedHits >= 2 || sentence.contains("全部未命中") || sentence.contains("均未命中")) {
                throw new IllegalArgumentException(
                        "规划结论与证据轨迹矛盾：已有跨项目证据命中，不能笼统描述为全部缺失或无法分析");
            }
        }
    }

    private EvidenceFacts parse(String traceJson) {
        if (traceJson == null || traceJson.isBlank()) {
            return EvidenceFacts.invalid();
        }
        try {
            JsonNode root = mapper.readTree(traceJson);
            JsonNode sources = root.path("sources");
            if (!sources.isArray()) {
                return EvidenceFacts.invalid();
            }
            String primaryProject = text(root, "primaryProject", text(root, "project", "未路由"));
            LinkedHashMap<String, MutableProjectFacts> grouped = new LinkedHashMap<>();
            ArrayList<EvidenceHit> hits = new ArrayList<>();
            LinkedHashSet<String> hitSourceTypes = new LinkedHashSet<>();
            for (JsonNode source : sources) {
                String project = text(source, "sourceProject", primaryProject);
                String role = text(source, "projectRole",
                        project.equals(primaryProject) ? "CURRENT_IMPLEMENTATION" : "RELATED_PROJECT");
                String sourceType = text(source, "source", "UNKNOWN");
                String status = text(source, "status", "NOT_INVOKED");
                MutableProjectFacts projectFacts = grouped.computeIfAbsent(
                        role + '\u0000' + project, ignored -> new MutableProjectFacts(project, role));
                projectFacts.add(status, sourceType);
                if ("HIT".equals(status)) {
                    hitSourceTypes.add(sourceType);
                    hits.add(new EvidenceHit(project, role, sourceType, text(source, "excerpt", "")));
                }
            }
            List<ProjectFacts> projects = grouped.values().stream().map(MutableProjectFacts::freeze).toList();
            boolean legacyHit = projects.stream().anyMatch(project -> !isCurrent(project.role())
                    && !project.hitSources().isEmpty());
            boolean currentGap = projects.stream().anyMatch(project -> isCurrent(project.role())
                    && (!project.noHitSources().isEmpty() || !project.missingSources().isEmpty()
                    || !project.errorSources().isEmpty()));
            return new EvidenceFacts(true, text(root, "traceId", "未标识"), primaryProject,
                    projects, hits, hitSourceTypes, !hits.isEmpty(), legacyHit, currentGap);
        } catch (JsonProcessingException error) {
            return EvidenceFacts.invalid();
        }
    }

    private static void appendStatuses(StringBuilder target, String label, Set<String> sources) {
        if (sources.isEmpty()) {
            return;
        }
        if (target.charAt(target.length() - 1) != '：') {
            target.append("；");
        }
        target.append(label).append(' ')
                .append(sources.stream().map(PlanningEvidenceTraceContext::sourceLabel).toList());
    }

    private static boolean containsNegativeClaim(String sentence) {
        return sentence.contains("未命中") || sentence.contains("缺少") || sentence.contains("没有")
                || sentence.contains("无法分析") || sentence.contains("无法获取") || sentence.contains("无法确认");
    }

    private static boolean isExplicitlyRoleScoped(String sentence, String primaryProject) {
        return sentence.contains("当前实现项目") || sentence.contains("目标项目")
                || (!primaryProject.isBlank() && sentence.contains(primaryProject));
    }

    private static boolean isCurrent(String role) {
        return "CURRENT_IMPLEMENTATION".equals(role) || "PRIMARY".equals(role);
    }

    private static String roleLabel(String role) {
        return switch (role) {
            case "CURRENT_IMPLEMENTATION", "PRIMARY" -> "当前实现";
            case "LEGACY_SOURCE" -> "遗留来源";
            case "DEPENDENCY" -> "依赖项目";
            default -> "关联项目";
        };
    }

    private static String sourceLabel(String source) {
        return SOURCE_LABELS.getOrDefault(source, source);
    }

    private static String text(JsonNode source, String field, String fallback) {
        String value = source.path(field).asText("").trim();
        return value.isBlank() ? fallback : value;
    }

    private static String bounded(String value, int maximum) {
        String text = value == null ? "" : value;
        return text.length() <= maximum ? text : text.substring(0, maximum) + "…";
    }

    private record EvidenceHit(String project, String role, String source, String excerpt) {
    }

    private record ProjectFacts(
            String project,
            String role,
            Set<String> hitSources,
            Set<String> noHitSources,
            Set<String> missingSources,
            Set<String> errorSources
    ) {
    }

    private record EvidenceFacts(
            boolean valid,
            String traceId,
            String primaryProject,
            List<ProjectFacts> projects,
            List<EvidenceHit> hits,
            Set<String> hitSourceTypes,
            boolean hasAnyHit,
            boolean hasLegacyHit,
            boolean currentHasGap
    ) {
        private static EvidenceFacts invalid() {
            return new EvidenceFacts(false, "", "", List.of(), List.of(), Set.of(), false, false, false);
        }
    }

    private static final class MutableProjectFacts {
        private final String project;
        private final String role;
        private final LinkedHashSet<String> hits = new LinkedHashSet<>();
        private final LinkedHashSet<String> noHits = new LinkedHashSet<>();
        private final LinkedHashSet<String> missing = new LinkedHashSet<>();
        private final LinkedHashSet<String> errors = new LinkedHashSet<>();

        private MutableProjectFacts(String project, String role) {
            this.project = project;
            this.role = role;
        }

        private void add(String status, String source) {
            switch (status) {
                case "HIT" -> hits.add(source);
                case "NO_HIT", "NO_HIT_OR_ERROR" -> noHits.add(source);
                case "SOURCE_MISSING" -> missing.add(source);
                case "EXECUTION_ERROR" -> errors.add(source);
                default -> {
                    // 未调用和不适用不参与结论。
                }
            }
        }

        private ProjectFacts freeze() {
            return new ProjectFacts(project, role, immutable(hits), immutable(noHits),
                    immutable(missing), immutable(errors));
        }

        private static Set<String> immutable(LinkedHashSet<String> source) {
            return Collections.unmodifiableSet(new LinkedHashSet<>(source));
        }
    }
}
