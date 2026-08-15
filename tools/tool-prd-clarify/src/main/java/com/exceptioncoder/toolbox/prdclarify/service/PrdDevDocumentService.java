package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.api.dto.DevDocVersionSummary;
import com.exceptioncoder.toolbox.prdclarify.api.dto.QaPairRequest;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactType;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
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
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 编排 TDD/执行计划的生成、持久化、历史与文件版本生命周期。
 */
@Slf4j
@Service
public class PrdDevDocumentService {

    private final PrdSessionRepository repo;
    private final PrdFileStore fileStore;
    private final PrdArtifactService artifactService;
    private final ObjectMapper mapper;
    private final GraphifyQueryService graphifyQuery;
    private final PrdDocumentGenerationService documentGenerationService;

    public PrdDevDocumentService(PrdSessionRepository repo,
                                 PrdFileStore fileStore,
                                 PrdArtifactService artifactService,
                                 ObjectMapper mapper,
                                 GraphifyQueryService graphifyQuery,
                                 AgentOneShotRunner agentRunner,
                                 PrdImageInputResolver imageInputResolver) {
        this.repo = repo;
        this.fileStore = fileStore;
        this.artifactService = artifactService;
        this.mapper = mapper;
        this.graphifyQuery = graphifyQuery;
        this.documentGenerationService =
                new PrdDocumentGenerationService(agentRunner, mapper, imageInputResolver);
    }

    /** 生成或更新开发文档，并在后台完成版本备份、落盘和历史登记。 */
    public void generate(String sessionId, String extraInstructions, Boolean updateExisting,
                         List<QaPairRequest> qaHistory, Boolean clarificationCompleted,
                         Boolean background, SseEmitter emitter) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        if (!Boolean.TRUE.equals(clarificationCompleted)) {
            throw new IllegalStateException("请先完成 TDD 技术澄清，再生成开发文档");
        }
        boolean update = Boolean.TRUE.equals(updateExisting);
        boolean continueOnDisconnect = Boolean.TRUE.equals(background);
        List<QaPairRequest> effectiveQaHistory = qaHistory == null ? List.of() : qaHistory;
        repo.updateDevDocQaDraft(sessionId, buildQuestionsJson(effectiveQaHistory));
        repo.updateDevDocWorkStatus(sessionId, "GENERATING", null);
        boolean hadExistingDoc = session.getDevDocPath() != null && !session.getDevDocPath().isBlank();
        String mode = update ? "update" : (hadExistingDoc ? "regenerate" : "generate");

        Thread.ofVirtual().name("prd-dev-doc-").start(() -> runGeneration(
                sessionId, session, extraInstructions, update, continueOnDisconnect,
                effectiveQaHistory, mode, emitter));
    }

    private void runGeneration(String sessionId, PrdSession session, String extraInstructions,
                               boolean update, boolean continueOnDisconnect,
                               List<QaPairRequest> qaHistory, String mode, SseEmitter emitter) {
        AtomicBoolean clientConnected = new AtomicBoolean(true);
        try {
            sendProgress(emitter, "正在准备 PRD、技术澄清与知识图谱上下文",
                    continueOnDisconnect, clientConnected);
            String prdContent = fileStore.read(sessionId);
            if (prdContent == null || prdContent.isBlank()) {
                repo.updateDevDocWorkStatus(sessionId, "ERROR", "PRD 内容为空，请先生成 PRD");
                sendError(emitter, new IllegalStateException("PRD 内容为空，请先生成 PRD"));
                return;
            }

            String currentDevDoc = update ? readContent(sessionId) : null;
            if (update && (currentDevDoc == null || currentDevDoc.isBlank())) {
                log.info("[prd-clarify] 更新模式但当前无开发文档，退回从零生成 sessionId={}", sessionId);
            }

            sendProgress(emitter, "codex".equalsIgnoreCase(session.getEngine())
                            ? "Codex 正在生成开发文档，首段内容可能需要稍候"
                            : "Claude 正在生成开发文档",
                    continueOnDisconnect, clientConnected);
            String graphContext = queryGraphContext(
                    session.getProject(), session.getModule(), session.getTitle()).orElse("");
            PrdDocumentGenerationService.DevDocGenerationRequest request =
                    new PrdDocumentGenerationService.DevDocGenerationRequest(
                            session, prdContent, currentDevDoc, extraInstructions, qaHistory,
                            graphContext, update, normalizeEngine(session.getEngine()));
            String devDocContent = documentGenerationService.generateDevDoc(request, delta -> {
                if (continueOnDisconnect) {
                    sendChunkBestEffort(emitter, delta, clientConnected);
                } else {
                    sendChunk(emitter, delta);
                }
            });

            sendProgress(emitter, "内容生成完成，正在保存开发文档",
                    continueOnDisconnect, clientConnected);
            Path devDocPath = fileStore.canonicalPathFor(sessionId, PrdArtifactType.DEV_DOC);
            backupIfExists(devDocPath);
            artifactService.write(sessionId, PrdArtifactType.DEV_DOC, devDocContent,
                    PrdArtifactService.ArtifactMetadata.empty());
            recordHistory(sessionId, session.getDevDocHistory(), mode,
                    extraInstructions, qaHistory, true);
            repo.updateDevDocQaDraft(sessionId, null);
            repo.updateDevDocWorkStatus(sessionId, "DONE", null);
            log.info("[prd-clarify] 开发文档已保存 path={} mode={}", devDocPath, mode);

            if (continueOnDisconnect) {
                sendDoneBestEffort(emitter, clientConnected);
            } else {
                sendDone(emitter);
            }
        } catch (Exception e) {
            log.warn("[prd-clarify] 开发文档生成失败 sessionId={}", sessionId, e);
            repo.updateDevDocWorkStatus(sessionId, "ERROR", e.getMessage());
            if (!continueOnDisconnect || clientConnected.get()) {
                sendError(emitter, e);
            }
        }
    }

    /** 读取当前开发文档内容。 */
    public String readContent(String sessionId) throws IOException {
        PrdSession session = findSession(sessionId);
        if (session.getDevDocPath() == null || session.getDevDocPath().isBlank()) {
            return "";
        }
        Path path = Path.of(session.getDevDocPath());
        if (!Files.exists(path)) {
            return "";
        }
        return Files.readString(path, StandardCharsets.UTF_8);
    }

    /** 读取指定开发文档版本；非法或缺失版本返回空字符串。 */
    public String readVersionContent(String sessionId, int version) throws IOException {
        PrdSession session = findSession(sessionId);
        if (version <= 0) {
            return "";
        }
        DevDocLocation location = resolveLocation(session);
        if (location == null) {
            return "";
        }
        List<Integer> backups = scanBackupVersions(location);
        int currentVersion = currentVersion(backups);
        if (version == currentVersion) {
            return readContent(sessionId);
        }
        if (!backups.contains(version)) {
            return "";
        }
        Path backupPath = location.dir().resolve(location.baseName() + "-v" + version + ".md");
        if (!Files.exists(backupPath)) {
            return "";
        }
        return Files.readString(backupPath, StandardCharsets.UTF_8);
    }

    /** 列出磁盘实际存在的开发文档版本，并用历史 JSON 补充生成元数据。 */
    public List<DevDocVersionSummary> listVersions(String sessionId) {
        PrdSession session = findSession(sessionId);
        DevDocLocation location = resolveLocation(session);
        if (location == null) {
            return List.of();
        }
        List<Integer> backups = scanBackupVersions(location);
        int currentVersion = currentVersion(backups);
        Map<Integer, JsonNode> historyByVersion = parseHistory(session.getDevDocHistory());

        List<Integer> versions = new ArrayList<>(backups);
        versions.add(currentVersion);
        List<DevDocVersionSummary> result = new ArrayList<>();
        for (int version : versions) {
            JsonNode history = historyByVersion.get(version);
            Long generatedAt = history != null ? history.path("generatedAt").asLong()
                    : (version == currentVersion ? session.getDevDocGeneratedAt() : null);
            result.add(new DevDocVersionSummary(
                    version,
                    version == currentVersion,
                    history != null ? history.path("mode").asText(null) : null,
                    history != null ? history.path("extraInstructions").asText("") : null,
                    generatedAt,
                    parseQaHistory(history)));
        }
        result.sort(Comparator.comparingInt(DevDocVersionSummary::version).reversed());
        return result;
    }

    /** 保存用户编辑后的开发文档，并在覆盖前保留当前版本。 */
    public void saveContent(String sessionId, String content) throws IOException {
        PrdSession session = findSession(sessionId);
        String devDocPath = session.getDevDocPath() == null || session.getDevDocPath().isBlank()
                ? fileStore.canonicalPathFor(sessionId, PrdArtifactType.DEV_DOC).toString()
                : session.getDevDocPath();
        backupIfExists(Path.of(devDocPath));
        artifactService.write(sessionId, PrdArtifactType.DEV_DOC, content,
                PrdArtifactService.ArtifactMetadata.empty());
    }

    private PrdSession findSession(String sessionId) {
        return repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
    }

    private void recordHistory(String sessionId, String existingHistoryJson, String mode,
                               String extraInstructions, List<QaPairRequest> qaHistory,
                               boolean clarificationCompleted) {
        try {
            JsonNode existing = existingHistoryJson == null || existingHistoryJson.isBlank()
                    ? null : mapper.readTree(existingHistoryJson);
            ArrayNode history = existing instanceof ArrayNode array
                    ? array : mapper.createArrayNode();
            ObjectNode entry = mapper.createObjectNode();
            entry.put("version", history.size() + 1);
            entry.put("mode", mode);
            entry.put("extraInstructions", extraInstructions == null ? "" : extraInstructions);
            entry.put("generatedAt", System.currentTimeMillis());
            entry.put("clarificationCompleted", clarificationCompleted);
            ArrayNode answers = mapper.createArrayNode();
            for (QaPairRequest qa : qaHistory) {
                ObjectNode answer = mapper.createObjectNode();
                answer.put("question", qa.question());
                answer.put("answer", qa.answer());
                answers.add(answer);
            }
            entry.set("qaHistory", answers);
            history.add(entry);
            repo.updateDevDocHistory(sessionId, mapper.writeValueAsString(history));
        } catch (Exception e) {
            log.warn("[prd-clarify] 记录开发文档生成历史失败（不影响本次生成结果）: {}", e.getMessage());
        }
    }

    private Map<Integer, JsonNode> parseHistory(String historyJson) {
        Map<Integer, JsonNode> result = new HashMap<>();
        try {
            if (historyJson != null && !historyJson.isBlank()) {
                JsonNode history = mapper.readTree(historyJson);
                if (history.isArray()) {
                    for (JsonNode item : history) {
                        result.put(item.path("version").asInt(-1), item);
                    }
                }
            }
        } catch (Exception e) {
            log.debug("[prd-clarify] 解析 devDocHistory 失败（不影响版本列表展示）: {}", e.getMessage());
        }
        return result;
    }

    private static List<QaPairRequest> parseQaHistory(JsonNode history) {
        if (history == null || !history.path("qaHistory").isArray()) {
            return List.of();
        }
        List<QaPairRequest> result = new ArrayList<>();
        for (JsonNode item : history.path("qaHistory")) {
            result.add(new QaPairRequest(
                    item.path("question").asText(""), item.path("answer").asText("")));
        }
        return result;
    }

    private void backupIfExists(Path devDocPath) {
        if (!Files.isRegularFile(devDocPath)) {
            return;
        }
        try {
            String fileName = devDocPath.getFileName().toString();
            String baseName = fileName.substring(0, fileName.length() - 3);
            Path dir = devDocPath.getParent();
            DevDocLocation location = dir == null ? null : new DevDocLocation(dir, baseName);
            List<Integer> backups = scanBackupVersions(location);
            int nextVersion = currentVersion(backups);
            Path backupPath = devDocPath.resolveSibling(baseName + "-v" + nextVersion + ".md");
            Files.copy(devDocPath, backupPath, StandardCopyOption.REPLACE_EXISTING);
            log.info("[prd-clarify] 开发文档旧版本已备份 path={}", backupPath);
        } catch (Exception e) {
            log.warn("[prd-clarify] 开发文档备份失败（不阻断本次生成）: {}", e.getMessage());
        }
    }

    private static int currentVersion(List<Integer> backups) {
        return (backups.isEmpty() ? 0 : backups.get(backups.size() - 1)) + 1;
    }

    private static DevDocLocation resolveLocation(PrdSession session) {
        if (session.getDevDocPath() == null || session.getDevDocPath().isBlank()) {
            return null;
        }
        Path currentPath = Path.of(session.getDevDocPath());
        String fileName = currentPath.getFileName().toString();
        String baseName = fileName.substring(0, fileName.length() - 3);
        Path dir = currentPath.getParent();
        return dir == null ? null : new DevDocLocation(dir, baseName);
    }

    private List<Integer> scanBackupVersions(DevDocLocation location) {
        if (location == null || !Files.isDirectory(location.dir())) {
            return List.of();
        }
        java.util.regex.Pattern pattern = java.util.regex.Pattern.compile(
                java.util.regex.Pattern.quote(location.baseName()) + "-v(\\d+)\\.md");
        try (var files = Files.list(location.dir())) {
            return files
                    .map(path -> pattern.matcher(path.getFileName().toString()))
                    .filter(java.util.regex.Matcher::matches)
                    .map(matcher -> Integer.parseInt(matcher.group(1)))
                    .sorted()
                    .toList();
        } catch (Exception e) {
            log.debug("[prd-clarify] 扫描开发文档备份版本失败: {}", e.getMessage());
            return List.of();
        }
    }

    private Optional<String> queryGraphContext(String project, String module, String title) {
        List<String> projects = splitProjects(project);
        if (projects.size() <= 1) {
            String singleProject = projects.isEmpty() ? null : projects.get(0);
            return Optional.ofNullable(graphifyQuery.query(singleProject, module, title));
        }
        StringBuilder merged = new StringBuilder();
        for (String singleProject : projects) {
            String result = graphifyQuery.query(singleProject, module, title);
            if (result != null && !result.isBlank()) {
                if (!merged.isEmpty()) {
                    merged.append("\n\n");
                }
                merged.append("--- 项目 ").append(singleProject).append(" ---\n").append(result);
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

    private String buildQuestionsJson(List<QaPairRequest> history) {
        try {
            ArrayNode result = mapper.createArrayNode();
            int id = 1;
            for (QaPairRequest qa : history) {
                ObjectNode item = mapper.createObjectNode();
                item.put("id", id++);
                item.put("question", qa.question());
                item.put("answer", qa.answer());
                result.add(item);
            }
            return mapper.writeValueAsString(result);
        } catch (JsonProcessingException e) {
            log.warn("[prd-clarify] buildQuestionsJson failed", e);
            return "[]";
        }
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

    private void sendChunk(SseEmitter emitter, String chunk) {
        if (chunk == null || chunk.isEmpty()) {
            return;
        }
        try {
            emitter.send(SseEmitter.event().name("chunk").data(Map.of("content", chunk)));
        } catch (Exception e) {
            emitter.completeWithError(e);
            throw new IllegalStateException("SSE client disconnected", e);
        }
    }

    private void sendChunkBestEffort(SseEmitter emitter, String chunk, AtomicBoolean clientConnected) {
        if (chunk == null || chunk.isEmpty() || !clientConnected.get()) {
            return;
        }
        try {
            emitter.send(SseEmitter.event().name("chunk").data(Map.of("content", chunk)));
        } catch (Exception e) {
            clientConnected.set(false);
            log.info("[prd-clarify] TDD 后台生成客户端已断开，继续执行并落盘");
        }
    }

    private void sendProgress(SseEmitter emitter, String message, boolean continueOnDisconnect,
                              AtomicBoolean clientConnected) {
        if (!continueOnDisconnect) {
            sendProgress(emitter, message);
            return;
        }
        if (!clientConnected.get()) {
            return;
        }
        try {
            emitter.send(SseEmitter.event().name("progress").data(Map.of("message", message)));
        } catch (Exception e) {
            clientConnected.set(false);
            log.info("[prd-clarify] TDD 后台生成客户端已断开，继续执行并落盘");
        }
    }

    private void sendDoneBestEffort(SseEmitter emitter, AtomicBoolean clientConnected) {
        if (!clientConnected.get()) {
            return;
        }
        try {
            emitter.send(SseEmitter.event().name("done").data("{}"));
            emitter.complete();
        } catch (Exception e) {
            clientConnected.set(false);
        }
    }

    private void sendDone(SseEmitter emitter) {
        try {
            emitter.send(SseEmitter.event().name("done").data("{}"));
            emitter.complete();
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
    }

    private void sendProgress(SseEmitter emitter, String message) {
        try {
            emitter.send(SseEmitter.event().name("progress").data(Map.of("message", message)));
        } catch (Exception e) {
            emitter.completeWithError(e);
            throw new IllegalStateException("SSE client disconnected", e);
        }
    }

    private void sendError(SseEmitter emitter, Throwable error) {
        String message = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
        try {
            emitter.send(SseEmitter.event().name("error").data(Map.of("message", message)));
            emitter.complete();
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
    }

    private record DevDocLocation(Path dir, String baseName) {
    }
}
