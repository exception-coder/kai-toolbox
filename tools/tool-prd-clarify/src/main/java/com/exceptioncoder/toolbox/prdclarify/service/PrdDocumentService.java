package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactType;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/** 编排 PRD 的生成、持久化、兼容版本备份与内容访问生命周期。 */
@Slf4j
@Service
public class PrdDocumentService {

    private final PrdSessionRepository repo;
    private final PrdFileStore fileStore;
    private final PrdArtifactService artifactService;
    private final PrdDocumentGenerationService documentGenerationService;

    public PrdDocumentService(PrdSessionRepository repo,
                              PrdFileStore fileStore,
                              PrdArtifactService artifactService,
                              AgentOneShotRunner agentRunner,
                              ObjectMapper mapper,
                              PrdImageInputResolver imageInputResolver) {
        this.repo = repo;
        this.fileStore = fileStore;
        this.artifactService = artifactService;
        this.documentGenerationService =
                new PrdDocumentGenerationService(agentRunner, mapper, imageInputResolver);
    }

    /** 生成或更新 PRD；普通模式在 SSE 断开时终止，后台模式继续生成并落盘。 */
    public void generate(String sessionId, String extraInstructions, Boolean updateExisting,
                         boolean continueOnDisconnect, SseEmitter emitter) {
        PrdSession session = repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        repo.updateStatus(sessionId, "GENERATING");
        boolean update = Boolean.TRUE.equals(updateExisting);

        Thread.ofVirtual().name("prd-generate-").start(() -> runGeneration(
                sessionId, session, extraInstructions, update, continueOnDisconnect, emitter));
    }

    private void runGeneration(String sessionId, PrdSession session, String extraInstructions,
                               boolean update, boolean continueOnDisconnect, SseEmitter emitter) {
        AtomicBoolean clientConnected = new AtomicBoolean(true);
        try {
            String currentPrd = update ? fileStore.read(sessionId) : null;
            if (update && (currentPrd == null || currentPrd.isBlank())) {
                log.info("[prd-clarify] 更新模式但当前无 PRD 内容，退回从零生成 sessionId={}", sessionId);
            }
            PrdDocumentGenerationService.PrdGenerationRequest request =
                    new PrdDocumentGenerationService.PrdGenerationRequest(
                            session, currentPrd, readInitialSpec(session), extraInstructions, update,
                            normalizeEngine(session.getEngine()));
            String prdContent = documentGenerationService.generatePrd(request, delta -> {
                if (continueOnDisconnect) {
                    sendChunkBestEffort(emitter, delta, clientConnected);
                } else {
                    sendChunk(emitter, delta);
                }
            });
            if (update) {
                backupIfExists(fileStore.pathFor(sessionId));
            }
            artifactService.write(sessionId, PrdArtifactType.PRD, prdContent,
                    PrdArtifactService.ArtifactMetadata.empty());

            if (continueOnDisconnect) {
                sendDoneBestEffort(emitter, clientConnected);
            } else {
                sendDone(emitter);
            }
        } catch (Exception error) {
            log.warn("[prd-clarify] 生成阶段失败 sessionId={}", sessionId, error);
            repo.updateError(sessionId, error.getMessage());
            if (!continueOnDisconnect || clientConnected.get()) {
                sendError(emitter, error);
            }
        }
    }

    /** 返回兼容主文件的期望路径，供外部写入检查使用。 */
    public Path pathFor(String sessionId) {
        return fileStore.pathFor(sessionId);
    }

    /** 备份当前兼容主文件后，将编辑内容写入不可变产物账本。 */
    public void saveContent(String sessionId, String content) throws IOException {
        repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        backupIfExists(fileStore.pathFor(sessionId));
        artifactService.write(sessionId, PrdArtifactType.PRD, content,
                PrdArtifactService.ArtifactMetadata.empty());
    }

    /** 读取当前 PRD 兼容主文件内容。 */
    public String readContent(String sessionId) throws IOException {
        repo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("会话不存在: " + sessionId));
        return fileStore.read(sessionId);
    }

    private String readInitialSpec(PrdSession session) {
        if (session.getInitialSpecPath() == null || session.getInitialSpecPath().isBlank()) {
            return "";
        }
        try {
            return Files.readString(Path.of(session.getInitialSpecPath()));
        } catch (IOException error) {
            log.warn("[prd-clarify] 核心规格生成前读取初始化规格失败 sessionId={}", session.getId(), error);
            return "";
        }
    }

    /** 覆盖 PRD 前保留递增版本；备份失败只记录日志，不阻断本次写入。 */
    private void backupIfExists(Path path) {
        if (!Files.isRegularFile(path)) {
            return;
        }
        try {
            String fileName = path.getFileName().toString();
            String baseName = fileName.substring(0, fileName.length() - 3);
            List<Integer> versions = scanBackupVersions(path.getParent(), baseName);
            int nextVersion = (versions.isEmpty() ? 0 : versions.get(versions.size() - 1)) + 1;
            Path backupPath = path.resolveSibling(baseName + "-v" + nextVersion + ".md");
            Files.copy(path, backupPath, StandardCopyOption.REPLACE_EXISTING);
            log.info("[prd-clarify] PRD 旧版本已备份 path={}", backupPath);
        } catch (Exception error) {
            log.warn("[prd-clarify] PRD 备份失败（不阻断本次更新）: {}", error.getMessage());
        }
    }

    private List<Integer> scanBackupVersions(Path directory, String baseName) {
        if (directory == null || !Files.isDirectory(directory)) {
            return List.of();
        }
        java.util.regex.Pattern versionPattern =
                java.util.regex.Pattern.compile(java.util.regex.Pattern.quote(baseName) + "-v(\\d+)\\.md");
        try (var files = Files.list(directory)) {
            return files
                    .map(path -> versionPattern.matcher(path.getFileName().toString()))
                    .filter(java.util.regex.Matcher::matches)
                    .map(matcher -> Integer.parseInt(matcher.group(1)))
                    .sorted()
                    .toList();
        } catch (Exception error) {
            log.debug("[prd-clarify] 扫描 PRD 备份版本失败: {}", error.getMessage());
            return List.of();
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
        } catch (Exception error) {
            emitter.completeWithError(error);
            throw new IllegalStateException("SSE client disconnected", error);
        }
    }

    private void sendChunkBestEffort(SseEmitter emitter, String chunk, AtomicBoolean clientConnected) {
        if (chunk == null || chunk.isEmpty() || !clientConnected.get()) {
            return;
        }
        try {
            emitter.send(SseEmitter.event().name("chunk").data(Map.of("content", chunk)));
        } catch (Exception error) {
            clientConnected.set(false);
            log.info("[prd-clarify] PRD 后台生成客户端已断开，继续执行并落盘");
        }
    }

    private void sendDoneBestEffort(SseEmitter emitter, AtomicBoolean clientConnected) {
        if (!clientConnected.get()) {
            return;
        }
        try {
            emitter.send(SseEmitter.event().name("done").data("{}"));
            emitter.complete();
        } catch (Exception error) {
            clientConnected.set(false);
        }
    }

    private void sendDone(SseEmitter emitter) {
        try {
            emitter.send(SseEmitter.event().name("done").data("{}"));
            emitter.complete();
        } catch (Exception error) {
            emitter.completeWithError(error);
        }
    }

    private void sendError(SseEmitter emitter, Throwable error) {
        String message = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
        try {
            emitter.send(SseEmitter.event().name("error").data(Map.of("message", message)));
            emitter.complete();
        } catch (Exception sendError) {
            emitter.completeWithError(sendError);
        }
    }
}
