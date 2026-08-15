package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.llm.spi.LocalProjectResolver;
import com.exceptioncoder.toolbox.prdclarify.api.dto.ProgressVersionSummary;
import com.exceptioncoder.toolbox.prdclarify.delivery.DeliveryClaimLedgerService;
import com.exceptioncoder.toolbox.prdclarify.delivery.DeliveryEvidenceVerifier;
import com.exceptioncoder.toolbox.prdclarify.domain.DocumentProfile;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifact;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactType;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdPromptDefinition;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdPromptPurpose;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * PRD 进度评估用例：生成可验证报告，并维护报告产物、历史与磁盘版本。
 */
@Slf4j
@Service
public class PrdProgressEvaluationService {

    private static final String CODE_EVIDENCE_VERIFIED = "<!-- CODE_EVIDENCE_STATUS: VERIFIED -->";
    private static final String CODE_EVIDENCE_INSUFFICIENT = "<!-- CODE_EVIDENCE_STATUS: INSUFFICIENT -->";

    private final AgentOneShotRunner agentRunner;
    private final PrdSessionRepository repo;
    private final PrdFileStore fileStore;
    private final PrdArtifactService artifactService;
    private final PrdPromptCatalog promptCatalog;
    private final PrdAiRunService aiRunService;
    private final DeliveryClaimLedgerService deliveryClaimLedgerService;
    private final ObjectMapper mapper;
    private final DomainKnowledgeQueryService domainKnowledgeQuery;
    private final ObjectProvider<LocalProjectResolver> localProjectResolver;

    public PrdProgressEvaluationService(
            AgentOneShotRunner agentRunner,
            PrdSessionRepository repo,
            PrdFileStore fileStore,
            PrdArtifactService artifactService,
            PrdPromptCatalog promptCatalog,
            PrdAiRunService aiRunService,
            DeliveryClaimLedgerService deliveryClaimLedgerService,
            ObjectMapper mapper,
            DomainKnowledgeQueryService domainKnowledgeQuery,
            ObjectProvider<LocalProjectResolver> localProjectResolver) {
        this.agentRunner = agentRunner;
        this.repo = repo;
        this.fileStore = fileStore;
        this.artifactService = artifactService;
        this.promptCatalog = promptCatalog;
        this.aiRunService = aiRunService;
        this.deliveryClaimLedgerService = deliveryClaimLedgerService;
        this.mapper = mapper;
        this.domainKnowledgeQuery = domainKnowledgeQuery;
        this.localProjectResolver = localProjectResolver;
    }

    /** 生成进度评估报告；调用立即返回，实际工作在虚拟线程中完成。 */
    public void evaluate(String sessionId, String extraContext, SseEmitter emitter) {
        PrdSession requestedSession = findSession(sessionId);
        PrdSession sourceSession = resolveLatestRevisionSource(requestedSession);

        Thread.ofVirtual().name("prd-progress-").start(() -> runEvaluation(
                sessionId, extraContext, emitter, requestedSession, sourceSession));
    }

    /** 读取当前进度评估文档内容。 */
    public String readContent(String sessionId) throws IOException {
        PrdSession session = findSession(sessionId);
        if (session.getProgressPath() == null || session.getProgressPath().isBlank()) {
            return "";
        }
        Path path = Path.of(session.getProgressPath());
        return Files.exists(path) ? Files.readString(path, StandardCharsets.UTF_8) : "";
    }

    /** 读取指定进度评估版本；非法或已缺失版本返回空字符串。 */
    public String readVersionContent(String sessionId, int version) throws IOException {
        PrdSession session = findSession(sessionId);
        if (version <= 0) {
            return "";
        }
        ProgressLocation location = resolveProgressLocation(session);
        if (location == null) {
            return "";
        }
        List<Integer> backups = scanBackupVersions(location);
        int currentVersion = nextVersion(backups);
        if (version == currentVersion) {
            return readContent(sessionId);
        }
        if (!backups.contains(version)) {
            return "";
        }
        Path backupPath = location.dir().resolve(location.baseName() + "-v" + version + ".md");
        return Files.exists(backupPath) ? Files.readString(backupPath, StandardCharsets.UTF_8) : "";
    }

    /** 列出当前版本及磁盘上真实存在的备份版本。 */
    public List<ProgressVersionSummary> listVersions(String sessionId) {
        PrdSession session = findSession(sessionId);
        ProgressLocation location = resolveProgressLocation(session);
        if (location == null) {
            return List.of();
        }
        List<Integer> backups = scanBackupVersions(location);
        int currentVersion = nextVersion(backups);
        Map<Integer, JsonNode> historyByVersion = parseHistory(session.getProgressHistory());

        List<Integer> versions = new ArrayList<>(backups);
        versions.add(currentVersion);
        List<ProgressVersionSummary> result = new ArrayList<>();
        for (int version : versions) {
            JsonNode history = historyByVersion.get(version);
            Long generatedAt = history != null
                    ? history.path("generatedAt").asLong()
                    : version == currentVersion ? session.getProgressGeneratedAt() : null;
            result.add(new ProgressVersionSummary(
                    version,
                    version == currentVersion,
                    history != null ? history.path("extraContext").asText("") : null,
                    generatedAt));
        }
        result.sort(Comparator.comparingInt(ProgressVersionSummary::version).reversed());
        return result;
    }

    private void runEvaluation(
            String sessionId,
            String extraContext,
            SseEmitter emitter,
            PrdSession requestedSession,
            PrdSession sourceSession) {
        PrdAiRunService.RunHandle aiRun = null;
        boolean aiRunFinished = false;
        String progressContent = null;
        try {
            String prdContent = fileStore.read(sourceSession.getId());
            String devDocContent = readDevDocContent(sourceSession);
            if (devDocContent.isBlank()) {
                sendError(emitter, new IllegalStateException("请先生成开发文档后再评估进度"));
                return;
            }
            LocalProjectResolver.ProjectLocation projectLocation = resolveLocalProject(sourceSession.getProject())
                    .orElseThrow(() -> new IllegalStateException(
                            "未匹配到项目“" + sourceSession.getProject() + "”的本地工作目录，无法核查代码进度"));
            String effortBaselineJson = requestedSession.getDevDocEstimation() != null
                    ? requestedSession.getDevDocEstimation()
                    : sourceSession.getDevDocEstimation();
            String userPrompt = buildPrompt(
                    sourceSession, prdContent, devDocContent, effortBaselineJson, extraContext, projectLocation);
            String engine = normalizeEngine(sourceSession.getEngine());
            PrdPromptDefinition prompt = promptCatalog.get(PrdPromptPurpose.PROGRESS_EVALUATION);
            aiRun = aiRunService.begin(prompt, userPrompt,
                    new PrdAiRunService.RunContext(sourceSession.getId(), engine, sourceSession.getModel()));
            StringBuilder streamedContent = new StringBuilder();
            AgentOneShotRunner.ExecutionRequest request = new AgentOneShotRunner.ExecutionRequest(
                    systemPrompt(prompt),
                    userPrompt,
                    projectLocation.path(),
                    sourceSession.getModel(),
                    engine,
                    "codex".equals(engine) ? "medium" : null,
                    null, null, null, null,
                    AgentOneShotRunner.TOOL_POLICY_CONSULT_READONLY);
            String returnedContent = agentRunner.stream(request, delta -> {
                streamedContent.append(delta);
                sendChunk(emitter, delta);
            });

            progressContent = streamedContent.isEmpty() ? returnedContent : streamedContent.toString();
            validateEvidenceStatus(progressContent);
            DeliveryEvidenceVerifier.VerifiedLedger claimLedger = deliveryClaimLedgerService.prepare(
                    progressContent, projectLocation.path());
            aiRunService.succeed(aiRun, progressContent);
            aiRunFinished = true;
            Path progressPath = fileStore.canonicalPathFor(sessionId, PrdArtifactType.PROGRESS);
            backupCurrentVersion(progressPath);
            PrdArtifact artifact = artifactService.write(
                    sessionId,
                    PrdArtifactType.PROGRESS,
                    progressContent,
                    new PrdArtifactService.ArtifactMetadata(aiRun.inputFingerprint(), prompt.version()));
            if (artifact != null) {
                deliveryClaimLedgerService.save(sessionId, artifact.id(), claimLedger);
                aiRunService.bindArtifact(aiRun.id(), artifact.id());
            }
            recordHistory(sessionId, requestedSession.getProgressHistory(), extraContext);
            log.info("[prd-clarify] 进度评估已保存 path={} sourceSessionId={}",
                    progressPath, sourceSession.getId());
            sendDone(emitter);
        } catch (Exception exception) {
            failAiRun(aiRun, aiRunFinished, progressContent, exception);
            log.warn("[prd-clarify] 进度评估失败 sessionId={}", sessionId, exception);
            sendError(emitter, exception);
        }
    }

    private String buildPrompt(
            PrdSession session,
            String prdContent,
            String devDocContent,
            String effortBaselineJson,
            String extraContext,
            LocalProjectResolver.ProjectLocation projectLocation) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("需求标题：").append(session.getTitle()).append("\n");
        prompt.append("文档模式：").append(DocumentProfile.normalize(session.getDocumentProfile())).append("\n");
        appendProject(prompt, session);
        if (session.getRawInput() != null && !session.getRawInput().isBlank()) {
            prompt.append("\n【原始需求输入】（包含 URL 时必须传给 source_context）\n")
                    .append(session.getRawInput()).append("\n");
        }
        boolean specDriven = isSpecDriven(session);
        prompt.append("\n【").append(specDriven ? "核心规格" : "PRD").append("内容】\n")
                .append(prdContent == null ? "" : prdContent).append("\n");
        prompt.append("\n【").append(specDriven ? "执行计划" : "最新 TDD / 开发文档")
                .append("内容】（技术方案基准，逐项核对是否已落地）\n")
                .append(devDocContent).append("\n");
        if (specDriven) {
            prompt.append("\n【规格驱动评估要求】\n按 REQ/RULE/SCN/AC 与 PLAN ID 建立追踪关系，")
                    .append("每个完成、部分完成或缺失结论必须引用源码或测试证据；")
                    .append("无法映射稳定 ID 的实现列为规格漂移，不得直接计为完成。\n");
        }
        appendEffortBaseline(prompt, effortBaselineJson);
        if (extraContext != null && !extraContext.isBlank()) {
            prompt.append("\n【补充上下文】\n").append(extraContext.trim()).append("\n");
        }
        appendDomainContext(prompt, queryDomainContext(session.getProject(), session.getTitle()));
        prompt.append("\n【测试核查】\n所有测试类功能点与其它功能点一样完整核查并写入对应完成状态章节。")
                .append("单元、接口、安全、集成、自动化、事务、并发、回归、性能、端到端、验收、兼容性等测试项，")
                .append("标题必须明确包含“测试”或 Test，便于后端基于同一报告确定性计算两种计分口径。")
                .append("联调、数据库迁移校验等非测试工作仍按普通功能点计分，除非标题明确将其定义为测试。\n");
        prompt.append("\n【本地代码核查】\n工作目录已限制为项目：")
                .append(projectLocation.name())
                .append("。必须先调用 source_context，再精确读取候选源码；不得仅凭上方文档或图谱判断进度。\n")
                .append("\n请基于以上信息生成开发进度评估报告，严格按系统提示的大纲输出 Markdown。");
        return prompt.toString();
    }

    private void appendProject(StringBuilder prompt, PrdSession session) {
        if (session.getProject() == null || session.getProject().isBlank()) {
            return;
        }
        prompt.append("项目：").append(session.getProject());
        if (session.getModule() != null && !session.getModule().isBlank()) {
            prompt.append(" / ").append(session.getModule());
        }
        prompt.append("\n");
    }

    private void appendEffortBaseline(StringBuilder prompt, String estimationJson) {
        if (estimationJson == null || estimationJson.isBlank()) {
            prompt.append("\n【原 AI 总工时评估基线】\n尚未生成总工时评估；只核对实现进度，")
                    .append("剩余工时将在后端等待基线补齐后再计算。\n");
            return;
        }
        try {
            JsonNode estimation = mapper.readTree(estimationJson);
            int hoursMin = Math.max(0, estimation.path("hoursMin").asInt(0));
            int hoursMax = Math.max(hoursMin, estimation.path("hoursMax").asInt(hoursMin));
            long estimatedAt = estimation.path("estimatedAt").asLong(0);
            if (!estimation.isObject() || hoursMax <= 0 || estimatedAt <= 0) {
                prompt.append("\n【原 AI 总工时评估基线】\n尚无有效的已完成评估结果。\n");
                return;
            }
            prompt.append("\n【原 AI 总工时评估基线】（来自需求中枢“责任与时间”，固定总量，不得按当前代码反向缩小）\n")
                    .append("- 原评估总工时：").append(hoursMin).append("-").append(hoursMax).append(" 小时\n")
                    .append("- 折算口径：6 个 AI 有效编码小时 / 工作日\n")
                    .append("- 评估信心：").append(estimation.path("confidence").asText("MEDIUM")).append("\n")
                    .append("- 评估时间：").append(estimatedAt).append("（Unix 毫秒）\n");
            appendOptionalBaselineValue(prompt, "- 原评估依据：", estimation.path("reasoning").asText(""));
            String invalidatedReason = estimation.path("invalidatedReason").asText("").trim();
            if (!invalidatedReason.isBlank()) {
                prompt.append("- 基线状态：已过期（").append(invalidatedReason)
                        .append("），报告必须明确提示重新评估总工时\n");
            }
            prompt.append("代码功能点状态必须继续基于当前 PRD、最新 TDD 与真实代码证据判断；")
                    .append("剩余小时和工作日由后端按代码进度确定性换算。\n");
        } catch (Exception exception) {
            prompt.append("\n【原 AI 总工时评估基线】\n历史评估数据无法解析；不得自行编造工时。\n");
        }
    }

    private static void appendOptionalBaselineValue(StringBuilder prompt, String label, String value) {
        if (value != null && !value.trim().isBlank()) {
            prompt.append(label).append(value.trim()).append("\n");
        }
    }

    private String systemPrompt(PrdPromptDefinition prompt) {
        return prompt.systemPrompt()
                + "\n证据状态标记：\n- 已核查：`" + CODE_EVIDENCE_VERIFIED
                + "`\n- 证据不足：`" + CODE_EVIDENCE_INSUFFICIENT + "`\n";
    }

    private void validateEvidenceStatus(String content) {
        if (content.contains(CODE_EVIDENCE_VERIFIED)) {
            return;
        }
        if (content.contains(CODE_EVIDENCE_INSUFFICIENT)) {
            boolean containsProgressItem = Pattern.compile("(?m)^- \\[(?:x|X|~| )] ")
                    .matcher(content)
                    .find();
            if (!containsProgressItem) {
                return;
            }
            throw new IllegalStateException("代码证据不足时不能生成完成度清单，请重新评估");
        }
        throw new IllegalStateException("进度评估未返回代码证据状态，已保留上一版报告");
    }

    private void failAiRun(
            PrdAiRunService.RunHandle aiRun,
            boolean aiRunFinished,
            String progressContent,
            Exception evaluationError) {
        if (aiRun == null || aiRunFinished) {
            return;
        }
        try {
            aiRunService.fail(aiRun, progressContent, evaluationError.getMessage());
        } catch (Exception auditError) {
            evaluationError.addSuppressed(auditError);
        }
    }

    private PrdSession resolveLatestRevisionSource(PrdSession requested) {
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

    private static boolean isSpecDriven(PrdSession session) {
        return DocumentProfile.SPEC_DRIVEN.name().equals(DocumentProfile.normalize(session.getDocumentProfile()));
    }

    private String readDevDocContent(PrdSession session) throws IOException {
        if (session.getDevDocPath() == null || session.getDevDocPath().isBlank()) {
            return "";
        }
        Path path = Path.of(session.getDevDocPath());
        return Files.exists(path) ? Files.readString(path, StandardCharsets.UTF_8) : "";
    }

    private Optional<LocalProjectResolver.ProjectLocation> resolveLocalProject(String project) {
        LocalProjectResolver resolver = localProjectResolver.getIfAvailable();
        return resolver == null ? Optional.empty() : resolver.resolve(project);
    }

    private Optional<String> queryDomainContext(String project, String title) {
        List<String> projects = splitProjects(project);
        if (projects.size() <= 1) {
            String projectName = projects.isEmpty() ? null : projects.get(0);
            return Optional.ofNullable(domainKnowledgeQuery.query(projectName, title));
        }
        StringBuilder merged = new StringBuilder();
        for (String projectName : projects) {
            String result = domainKnowledgeQuery.query(projectName, title);
            if (result != null && !result.isBlank()) {
                if (!merged.isEmpty()) {
                    merged.append("\n\n");
                }
                merged.append("--- 项目 ").append(projectName).append(" ---\n").append(result);
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

    private static void appendDomainContext(StringBuilder prompt, Optional<String> domainContext) {
        if (domainContext.isEmpty() || domainContext.get().isBlank()) {
            return;
        }
        prompt.append("\n【业务知识图谱查询结果】（系统已直接检索 project-domain-knowledge 库，内容为团队沉淀的业务真理，可信）\n")
                .append(domainContext.get()).append("\n");
    }

    private void recordHistory(String sessionId, String existingHistoryJson, String extraContext) {
        try {
            JsonNode existing = existingHistoryJson == null || existingHistoryJson.isBlank()
                    ? null : mapper.readTree(existingHistoryJson);
            ArrayNode history = existing instanceof ArrayNode existingArray
                    ? existingArray : mapper.createArrayNode();
            ObjectNode entry = mapper.createObjectNode();
            entry.put("version", history.size() + 1);
            entry.put("extraContext", extraContext == null ? "" : extraContext);
            entry.put("generatedAt", System.currentTimeMillis());
            history.add(entry);
            repo.updateProgressHistory(sessionId, mapper.writeValueAsString(history));
        } catch (Exception exception) {
            log.warn("[prd-clarify] 记录进度评估历史失败（不影响本次评估结果）: {}", exception.getMessage());
        }
    }

    private Map<Integer, JsonNode> parseHistory(String historyJson) {
        Map<Integer, JsonNode> historyByVersion = new HashMap<>();
        try {
            if (historyJson == null || historyJson.isBlank()) {
                return historyByVersion;
            }
            JsonNode history = mapper.readTree(historyJson);
            if (history.isArray()) {
                for (JsonNode entry : history) {
                    historyByVersion.put(entry.path("version").asInt(-1), entry);
                }
            }
        } catch (Exception exception) {
            log.debug("[prd-clarify] 解析 progressHistory 失败（不影响版本列表展示）: {}", exception.getMessage());
        }
        return historyByVersion;
    }

    private void backupCurrentVersion(Path progressPath) {
        if (!Files.isRegularFile(progressPath)) {
            return;
        }
        try {
            String fileName = progressPath.getFileName().toString();
            String baseName = fileName.substring(0, fileName.length() - 3);
            Path directory = progressPath.getParent();
            ProgressLocation location = directory == null ? null : new ProgressLocation(directory, baseName);
            int nextVersion = nextVersion(scanBackupVersions(location));
            Path backupPath = progressPath.resolveSibling(baseName + "-v" + nextVersion + ".md");
            Files.copy(progressPath, backupPath, StandardCopyOption.REPLACE_EXISTING);
            log.info("[prd-clarify] 进度评估旧版本已备份 path={}", backupPath);
        } catch (Exception exception) {
            log.warn("[prd-clarify] 进度评估备份失败（不阻断本次评估）: {}", exception.getMessage());
        }
    }

    private ProgressLocation resolveProgressLocation(PrdSession session) {
        if (session.getProgressPath() == null || session.getProgressPath().isBlank()) {
            return null;
        }
        Path currentPath = Path.of(session.getProgressPath());
        String fileName = currentPath.getFileName().toString();
        String baseName = fileName.substring(0, fileName.length() - 3);
        Path directory = currentPath.getParent();
        return directory == null ? null : new ProgressLocation(directory, baseName);
    }

    private List<Integer> scanBackupVersions(ProgressLocation location) {
        if (location == null || !Files.isDirectory(location.dir())) {
            return List.of();
        }
        Pattern versionPattern = Pattern.compile(Pattern.quote(location.baseName()) + "-v(\\d+)\\.md");
        try (var files = Files.list(location.dir())) {
            return files
                    .map(path -> versionPattern.matcher(path.getFileName().toString()))
                    .filter(Matcher::matches)
                    .map(matcher -> Integer.parseInt(matcher.group(1)))
                    .sorted()
                    .toList();
        } catch (Exception exception) {
            log.debug("[prd-clarify] 扫描进度评估备份版本失败: {}", exception.getMessage());
            return List.of();
        }
    }

    private static int nextVersion(List<Integer> backups) {
        return (backups.isEmpty() ? 0 : backups.get(backups.size() - 1)) + 1;
    }

    private PrdSession findSession(String sessionId) {
        return repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
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

    private static void sendChunk(SseEmitter emitter, String chunk) {
        if (chunk == null || chunk.isEmpty()) {
            return;
        }
        try {
            emitter.send(SseEmitter.event().name("chunk").data(Map.of("content", chunk)));
        } catch (Exception exception) {
            emitter.completeWithError(exception);
            throw new IllegalStateException("SSE client disconnected", exception);
        }
    }

    private static void sendDone(SseEmitter emitter) {
        try {
            emitter.send(SseEmitter.event().name("done").data("{}"));
            emitter.complete();
        } catch (Exception exception) {
            emitter.completeWithError(exception);
        }
    }

    private static void sendError(SseEmitter emitter, Throwable error) {
        String message = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
        try {
            emitter.send(SseEmitter.event().name("error").data(Map.of("message", message)));
            emitter.complete();
        } catch (Exception exception) {
            emitter.completeWithError(exception);
        }
    }

    private record ProgressLocation(Path dir, String baseName) {
    }
}
