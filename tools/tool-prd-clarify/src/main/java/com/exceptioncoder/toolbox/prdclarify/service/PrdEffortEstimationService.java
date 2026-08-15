package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.llm.spi.LocalProjectResolver;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * PRD 开发工时评估服务，负责证据收集、模型调用、结果校验和后台任务状态。
 */
@Slf4j
@Service
public class PrdEffortEstimationService {

    private static final int MAX_REPAIR_INPUT_LENGTH = 24_000;
    private static final Set<String> SUPPORTED_CONFIDENCE = Set.of("LOW", "MEDIUM", "HIGH");

    private final AgentOneShotRunner agentRunner;
    private final PrdSessionRepository repo;
    private final PrdFileStore fileStore;
    private final ObjectMapper mapper;
    private final GraphifyQueryService graphifyQuery;
    private final DomainKnowledgeQueryService domainKnowledgeQuery;
    private final ObjectProvider<LocalProjectResolver> localProjectResolver;
    private final Set<String> activeEstimations = ConcurrentHashMap.newKeySet();

    public PrdEffortEstimationService(AgentOneShotRunner agentRunner,
                                      PrdSessionRepository repo,
                                      PrdFileStore fileStore,
                                      ObjectMapper mapper,
                                      GraphifyQueryService graphifyQuery,
                                      DomainKnowledgeQueryService domainKnowledgeQuery,
                                      ObjectProvider<LocalProjectResolver> localProjectResolver) {
        this.agentRunner = agentRunner;
        this.repo = repo;
        this.fileStore = fileStore;
        this.mapper = mapper;
        this.graphifyQuery = graphifyQuery;
        this.domainKnowledgeQuery = domainKnowledgeQuery;
        this.localProjectResolver = localProjectResolver;
    }

    /** 同步执行工时评估，供兼容入口和测试调用。 */
    public PrdSession estimate(String sessionId, String extraContext, String requestedEngine) {
        return estimate(sessionId, extraContext, requestedEngine, System.currentTimeMillis());
    }

    /** 登记后台工时评估任务并立即返回最新会话。 */
    public PrdSession start(String sessionId, String extraContext, String requestedEngine) {
        PrdSession session = requireSession(sessionId);
        if (!activeEstimations.add(sessionId)) {
            return session;
        }
        String engine = normalizeEngine(requestedEngine == null || requestedEngine.isBlank()
                ? session.getEngine() : requestedEngine);
        long startedAt = System.currentTimeMillis();
        updateWorkState(sessionId, "RUNNING", "", engine, startedAt);
        Thread.ofVirtual().name("prd-effort-estimate-" + sessionId + "-").start(() -> {
            try {
                estimate(sessionId, extraContext, engine, startedAt);
            } catch (Exception e) {
                log.warn("[prd-clarify] 后台 AI 工时评估失败 sessionId={}", sessionId, e);
                updateWorkState(sessionId, "ERROR", e.getMessage(), engine, startedAt);
            } finally {
                activeEstimations.remove(sessionId);
            }
        });
        return requireSession(sessionId);
    }

    private PrdSession estimate(String sessionId, String extraContext, String requestedEngine, long startedAt) {
        PrdSession sourceSession = resolveLatestSource(requireSession(sessionId));
        String prdContent;
        String devDocContent;
        try {
            prdContent = fileStore.read(sourceSession.getId());
            devDocContent = readDevDocContent(sourceSession);
        } catch (IOException e) {
            throw new IllegalStateException("读取 PRD/开发文档失败: " + e.getMessage(), e);
        }
        Optional<LocalProjectResolver.ProjectLocation> projectLocation =
                resolveLocalProject(sourceSession.getProject());
        String engine = normalizeEngine(requestedEngine == null || requestedEngine.isBlank()
                ? sourceSession.getEngine() : requestedEngine);
        AgentOneShotRunner.ExecutionRequest request = buildExecutionRequest(
                sourceSession, prdContent, devDocContent, extraContext, projectLocation, engine);
        String raw = agentRunner.runOnce(request);
        String estimationJson = parseEstimation(
                raw, engine, projectLocation, sourceSession, prdContent, devDocContent, startedAt);
        repo.updateDevDocEstimation(sessionId, estimationJson);
        return requireSession(sessionId);
    }

    private AgentOneShotRunner.ExecutionRequest buildExecutionRequest(
            PrdSession session,
            String prdContent,
            String devDocContent,
            String extraContext,
            Optional<LocalProjectResolver.ProjectLocation> projectLocation,
            String engine) {
        return new AgentOneShotRunner.ExecutionRequest(
                PrdEffortPrompts.ESTIMATE_SYSTEM,
                buildPrompt(session, prdContent, devDocContent, extraContext, projectLocation),
                projectLocation.map(LocalProjectResolver.ProjectLocation::path).orElse(null),
                session.getModel(),
                engine,
                "codex".equals(engine) ? "medium" : null,
                null, null, null, null,
                projectLocation.isPresent()
                        ? AgentOneShotRunner.TOOL_POLICY_CONSULT_READONLY
                        : AgentOneShotRunner.TOOL_POLICY_DISABLED);
    }

    private void updateWorkState(String sessionId, String status, String error, String engine, long startedAt) {
        PrdSession session = repo.findById(sessionId).orElse(null);
        if (session == null) {
            return;
        }
        ObjectNode state = readPreviousState(session);
        state.put("workStatus", status);
        state.put("workError", error == null ? "" : error);
        state.put("workEngine", engine);
        state.put("startedAt", startedAt);
        if ("ERROR".equals(status)) {
            state.put("completedAt", System.currentTimeMillis());
        }
        try {
            repo.updateDevDocEstimation(sessionId, mapper.writeValueAsString(state));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("保存工时评估后台状态失败", e);
        }
    }

    private ObjectNode readPreviousState(PrdSession session) {
        ObjectNode state = mapper.createObjectNode();
        if (session.getDevDocEstimation() == null || session.getDevDocEstimation().isBlank()) {
            return state;
        }
        try {
            JsonNode previous = mapper.readTree(session.getDevDocEstimation());
            return previous instanceof ObjectNode object ? object.deepCopy() : state;
        } catch (JsonProcessingException ignored) {
            return state;
        }
    }

    private PrdSession resolveLatestSource(PrdSession requested) {
        PrdSession revisionRoot = requested;
        if (isRevision(requested) && requested.getParentId() != null && !requested.getParentId().isBlank()) {
            revisionRoot = repo.findById(requested.getParentId()).orElse(requested);
        }
        return repo.findLatestRevision(revisionRoot.getId()).orElse(requested);
    }

    private static boolean isRevision(PrdSession session) {
        String rawInput = session.getRawInput();
        return rawInput != null && (rawInput.startsWith("【后台自动修订") || rawInput.startsWith("【修订版 PRD"));
    }

    private String buildPrompt(PrdSession session, String prdContent, String devDocContent, String extraContext,
                               Optional<LocalProjectResolver.ProjectLocation> projectLocation) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("需求标题：").append(session.getTitle()).append("\n");
        appendProject(prompt, session);
        prompt.append("\n【PRD 内容】\n").append(prdContent == null ? "" : prdContent).append("\n");
        appendDevDoc(prompt, devDocContent);
        if (extraContext != null && !extraContext.isBlank()) {
            prompt.append("\n【补充上下文】\n").append(extraContext.trim()).append("\n");
        }
        appendGraphContext(prompt, queryGraphContext(session));
        appendDomainContext(prompt, queryDomainContext(session));
        appendLocalProjectContext(prompt, projectLocation);
        prompt.append("\n请基于以上信息评估开发工时，严格按系统提示的 JSON 结构输出。");
        return prompt.toString();
    }

    private static void appendProject(StringBuilder prompt, PrdSession session) {
        if (session.getProject() == null || session.getProject().isBlank()) {
            return;
        }
        prompt.append("项目：").append(session.getProject());
        if (session.getModule() != null && !session.getModule().isBlank()) {
            prompt.append(" / ").append(session.getModule());
        }
        prompt.append("\n");
    }

    private static void appendDevDoc(StringBuilder prompt, String devDocContent) {
        if (devDocContent == null || devDocContent.isBlank()) {
            prompt.append("\n【开发文档内容】\n尚未生成 TDD/开发文档；必须降低信心并扩大区间。\n");
            return;
        }
        prompt.append("\n【开发文档内容】（已基于最新 PRD 生成，以此为准做工时拆解）\n")
                .append(devDocContent).append("\n");
    }

    private static void appendLocalProjectContext(
            StringBuilder prompt,
            Optional<LocalProjectResolver.ProjectLocation> projectLocation) {
        if (projectLocation.isPresent()) {
            prompt.append("\n【本地代码核查】\n已将工作目录限制为项目：")
                    .append(projectLocation.get().name())
                    .append("。请实际使用只读工具检查与需求/模块相关的代码、测试和依赖，并在 inspectedFiles 中记录关键相对路径。\n");
            return;
        }
        prompt.append("\n【本地代码核查】\n没有在已配置工作区中匹配到项目目录，本次禁止调用工具；")
                .append("必须在 codeEvidenceSummary 说明未核查代码，并降低 confidence。\n");
    }

    private String parseEstimation(String raw, String engine,
                                   Optional<LocalProjectResolver.ProjectLocation> projectLocation,
                                   PrdSession sourceSession, String prdContent, String devDocContent,
                                   long startedAt) {
        JsonNode node = extractOrRepair(raw, engine, sourceSession);
        if (!node.isObject()) {
            throw new IllegalStateException("工时评估结果格式不正确，请重试");
        }
        ObjectNode result = buildNormalizedResult(node, engine, projectLocation);
        appendEvidence(result, sourceSession, prdContent, devDocContent, projectLocation);
        appendCompletedState(result, engine, startedAt);
        try {
            return mapper.writeValueAsString(result);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("工时评估结果序列化失败: " + e.getMessage(), e);
        }
    }

    private JsonNode extractOrRepair(String raw, String engine, PrdSession sourceSession) {
        try {
            return extractEffortJson(raw);
        } catch (Exception firstError) {
            log.info("[prd-clarify] 工时评估混合输出未找到最终 JSON，执行一次格式修复: {}",
                    firstError.getMessage());
            try {
                String repairInput = truncateRepairInput(raw);
                AgentOneShotRunner.ExecutionRequest repairRequest = new AgentOneShotRunner.ExecutionRequest(
                        PrdEffortPrompts.JSON_REPAIR_SYSTEM, repairInput, null, sourceSession.getModel(), engine,
                        "codex".equals(engine) ? "low" : null,
                        null, null, null, null, AgentOneShotRunner.TOOL_POLICY_DISABLED);
                return extractEffortJson(agentRunner.runOnce(repairRequest));
            } catch (Exception repairError) {
                repairError.addSuppressed(firstError);
                throw new IllegalStateException("工时评估最终结果缺少合法 JSON，请重试: "
                        + repairError.getMessage(), repairError);
            }
        }
    }

    private static String truncateRepairInput(String raw) {
        String repairInput = raw == null ? "" : raw;
        if (repairInput.length() <= MAX_REPAIR_INPUT_LENGTH) {
            return repairInput;
        }
        return repairInput.substring(repairInput.length() - MAX_REPAIR_INPUT_LENGTH);
    }

    private ObjectNode buildNormalizedResult(
            JsonNode node,
            String engine,
            Optional<LocalProjectResolver.ProjectLocation> projectLocation) {
        int hoursMin = Math.max(0, node.path("hoursMin").asInt(0));
        int hoursMax = Math.max(hoursMin, node.path("hoursMax").asInt(hoursMin));
        String confidence = normalizeConfidence(node.path("confidence").asText("MEDIUM"));
        ObjectNode result = mapper.createObjectNode();
        result.put("hoursMin", hoursMin);
        result.put("hoursMax", hoursMax);
        result.put("confidence", confidence);
        result.put("reasoning", node.path("reasoning").asText(""));
        result.set("breakdown", buildBreakdown(node));
        copyStringArray(node, result, "inspectedFiles", 12);
        copyStringArray(node, result, "assumptions", 5);
        copyStringArray(node, result, "risks", 5);
        result.put("codeEvidenceSummary", node.path("codeEvidenceSummary").asText(
                projectLocation.isPresent() ? "未返回代码核查摘要" : "未匹配到本地项目，未核查代码"));
        result.put("engine", engine);
        result.put("projectPath", projectLocation.map(LocalProjectResolver.ProjectLocation::path).orElse(""));
        result.put("codeInspected", projectLocation.isPresent() && result.path("inspectedFiles").size() > 0);
        return result;
    }

    private ArrayNode buildBreakdown(JsonNode node) {
        ArrayNode breakdown = mapper.createArrayNode();
        for (JsonNode item : node.path("breakdown")) {
            ObjectNode normalized = mapper.createObjectNode();
            normalized.put("item", item.path("item").asText(""));
            normalized.put("hours", item.path("hours").asDouble(0));
            breakdown.add(normalized);
        }
        return breakdown;
    }

    private void appendEvidence(ObjectNode result, PrdSession sourceSession, String prdContent,
                                String devDocContent,
                                Optional<LocalProjectResolver.ProjectLocation> projectLocation) {
        String prdPath = fileStore.pathFor(sourceSession.getId()).toAbsolutePath().normalize().toString();
        String tddPath = sourceSession.getDevDocPath();
        if (tddPath == null || tddPath.isBlank()) {
            tddPath = prdPath.replaceFirst("\\.md$", "-dev.md");
        }
        List<String> inspectedFiles = new ArrayList<>();
        result.path("inspectedFiles").forEach(value -> inspectedFiles.add(value.asText("")));
        String projectPath = projectLocation.map(LocalProjectResolver.ProjectLocation::path).orElse("");
        result.put("sourceSessionId", sourceSession.getId());
        result.put("sourceTitle", sourceSession.getTitle());
        result.put("prdPath", prdPath);
        result.put("tddPath", tddPath);
        result.put("prdFingerprint", EstimationEvidenceFingerprint.text(prdContent));
        result.put("tddFingerprint", EstimationEvidenceFingerprint.text(devDocContent));
        result.put("codeFingerprint", EstimationEvidenceFingerprint.inspectedFiles(projectPath, inspectedFiles));
    }

    private static void appendCompletedState(ObjectNode result, String engine, long startedAt) {
        long completedAt = System.currentTimeMillis();
        result.put("workStatus", "COMPLETED");
        result.put("workError", "");
        result.put("workEngine", engine);
        result.put("startedAt", startedAt);
        result.put("completedAt", completedAt);
        result.put("estimatedAt", completedAt);
    }

    private JsonNode extractEffortJson(String raw) throws JsonProcessingException {
        String text = stripFence(raw == null ? "" : raw.trim());
        JsonNode direct = tryReadEffortObject(text);
        if (direct != null) {
            return direct;
        }
        JsonNode latest = findLatestEffortObject(text);
        if (latest != null) {
            return latest;
        }
        throw new JsonProcessingException("未找到同时包含 hoursMin 和 hoursMax 的 JSON 对象") { };
    }

    private JsonNode findLatestEffortObject(String text) {
        JsonNode latest = null;
        for (int start = 0; start < text.length(); start++) {
            if (text.charAt(start) != '{') {
                continue;
            }
            JsonNode candidate = findEffortObjectFrom(text, start);
            if (candidate != null) {
                latest = candidate;
            }
        }
        return latest;
    }

    private JsonNode findEffortObjectFrom(String text, int start) {
        int depth = 0;
        boolean inString = false;
        boolean escaped = false;
        for (int end = start; end < text.length(); end++) {
            char current = text.charAt(end);
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (current == '\\') {
                    escaped = true;
                } else if (current == '"') {
                    inString = false;
                }
                continue;
            }
            if (current == '"') {
                inString = true;
            } else if (current == '{') {
                depth++;
            } else if (current == '}' && --depth == 0) {
                return tryReadEffortObject(text.substring(start, end + 1));
            }
        }
        return null;
    }

    private JsonNode tryReadEffortObject(String candidate) {
        if (candidate == null || candidate.isBlank()) {
            return null;
        }
        try {
            JsonNode node = mapper.readTree(candidate);
            return node != null && node.isObject() && node.has("hoursMin") && node.has("hoursMax") ? node : null;
        } catch (JsonProcessingException ignored) {
            return null;
        }
    }

    private void copyStringArray(JsonNode source, ObjectNode target, String field, int limit) {
        ArrayNode values = mapper.createArrayNode();
        JsonNode input = source.path(field);
        if (input.isArray()) {
            int count = 0;
            for (JsonNode value : input) {
                String text = value.asText("").trim();
                if (!text.isBlank()) {
                    values.add(text);
                    count++;
                    if (count >= limit) {
                        break;
                    }
                }
            }
        }
        target.set(field, values);
    }

    private Optional<String> queryGraphContext(PrdSession session) {
        return queryAcrossProjects(session.getProject(),
                project -> graphifyQuery.query(project, session.getModule(), session.getTitle()));
    }

    private Optional<String> queryDomainContext(PrdSession session) {
        return queryAcrossProjects(session.getProject(),
                project -> domainKnowledgeQuery.query(project, session.getTitle()));
    }

    private static Optional<String> queryAcrossProjects(
            String projectNames,
            java.util.function.Function<String, String> query) {
        List<String> projects = splitProjects(projectNames);
        if (projects.size() <= 1) {
            String project = projects.isEmpty() ? null : projects.get(0);
            return Optional.ofNullable(query.apply(project));
        }
        StringBuilder merged = new StringBuilder();
        for (String project : projects) {
            String result = query.apply(project);
            if (result != null && !result.isBlank()) {
                if (!merged.isEmpty()) {
                    merged.append("\n\n");
                }
                merged.append("--- 项目 ").append(project).append(" ---\n").append(result);
            }
        }
        return merged.isEmpty() ? Optional.empty() : Optional.of(merged.toString());
    }

    private static List<String> splitProjects(String project) {
        if (project == null || project.isBlank()) {
            return List.of();
        }
        return Arrays.stream(project.split("[,，、]"))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .distinct()
                .toList();
    }

    private static void appendGraphContext(StringBuilder prompt, Optional<String> graphContext) {
        if (graphContext.isEmpty() || graphContext.get().isBlank()) {
            return;
        }
        prompt.append("\n【代码知识图谱查询结果】（系统已直接调用 graphify CLI 查询，非 MCP，内容为真实代码事实）\n")
                .append(graphContext.get()).append("\n");
    }

    private static void appendDomainContext(StringBuilder prompt, Optional<String> domainContext) {
        if (domainContext.isEmpty() || domainContext.get().isBlank()) {
            return;
        }
        prompt.append("\n【业务知识图谱查询结果】（系统已直接检索 project-domain-knowledge 库，内容为团队沉淀的业务真理，可信）\n")
                .append(domainContext.get()).append("\n");
    }

    private Optional<LocalProjectResolver.ProjectLocation> resolveLocalProject(String project) {
        LocalProjectResolver resolver = localProjectResolver.getIfAvailable();
        return resolver == null ? Optional.empty() : resolver.resolve(project);
    }

    private static String readDevDocContent(PrdSession session) throws IOException {
        if (session.getDevDocPath() == null || session.getDevDocPath().isBlank()) {
            return "";
        }
        Path path = Path.of(session.getDevDocPath());
        return Files.exists(path) ? Files.readString(path, StandardCharsets.UTF_8) : "";
    }

    private PrdSession requireSession(String sessionId) {
        return repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
    }

    private static String normalizeConfidence(String confidence) {
        String normalized = confidence.toUpperCase();
        return SUPPORTED_CONFIDENCE.contains(normalized) ? normalized : "MEDIUM";
    }

    private static String normalizeEngine(String engine) {
        if (engine == null || engine.isBlank() || "claude".equalsIgnoreCase(engine)) {
            return "claude";
        }
        if ("codex".equalsIgnoreCase(engine)) {
            return "codex";
        }
        throw new IllegalArgumentException("不支持的 Agent 引擎: " + engine);
    }

    private static String stripFence(String value) {
        if (value.startsWith("```")) {
            int start = value.indexOf('\n');
            int end = value.lastIndexOf("```");
            if (start > 0 && end > start) {
                return value.substring(start + 1, end).trim();
            }
        }
        return value;
    }
}
