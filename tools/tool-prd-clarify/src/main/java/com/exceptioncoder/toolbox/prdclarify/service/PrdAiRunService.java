package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdAiRun;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdAiRunStatus;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdPromptDefinition;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdAiRunRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collection;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

/** 一次 PRD AI 调用的登记、终结和业务身份关联能力。 */
@Service
public class PrdAiRunService {

    private static final int MAX_ERROR_LENGTH = 500;

    private final PrdAiRunRepository repository;

    public PrdAiRunService(PrdAiRunRepository repository) {
        this.repository = repository;
    }

    /** 在调用模型之前建立 RUNNING 记录。 */
    public RunHandle begin(PrdPromptDefinition prompt, String userPrompt, RunContext context) {
        if (prompt == null) {
            throw new IllegalArgumentException("Prompt 定义不能为空");
        }
        RunContext effectiveContext = context == null ? RunContext.empty() : context;
        long now = System.currentTimeMillis();
        String id = UUID.randomUUID().toString();
        String inputFingerprint = sha256(value(userPrompt));
        repository.insert(new PrdAiRun(
                id, blankToNull(effectiveContext.sessionId()), prompt.purpose(), prompt.version(), prompt.sha256(),
                inputFingerprint, blankToNull(effectiveContext.engine()), blankToNull(effectiveContext.model()),
                null, null, PrdAiRunStatus.RUNNING, null, null, now, null, now, now));
        return new RunHandle(id, inputFingerprint, prompt.version());
    }

    /** 以通过契约校验的模型输出结束运行。 */
    public void succeed(RunHandle handle, String output) {
        complete(handle, PrdAiRunStatus.SUCCEEDED, output, null);
    }

    /** 以运行或输出校验失败结束运行。 */
    public void fail(RunHandle handle, String output, String error) {
        complete(handle, PrdAiRunStatus.FAILED, output, abbreviate(error));
    }

    /** 将同一分析流程中的阶段运行绑定到候选。 */
    @Transactional
    public void bindCandidate(Collection<String> runIds, String candidateId) {
        if (runIds == null || candidateId == null || candidateId.isBlank()) {
            return;
        }
        List<String> effectiveIds = runIds.stream()
                .filter(id -> id != null && !id.isBlank())
                .distinct()
                .toList();
        if (!effectiveIds.isEmpty()) {
            repository.bindCandidate(effectiveIds, candidateId);
        }
    }

    /** 将一次成功运行绑定到最终产物。 */
    public void bindArtifact(String runId, String artifactId) {
        if (runId != null && !runId.isBlank() && artifactId != null && !artifactId.isBlank()) {
            repository.bindArtifact(runId, artifactId);
        }
    }

    private void complete(RunHandle handle, PrdAiRunStatus status, String output, String error) {
        if (handle == null) {
            throw new IllegalArgumentException("AI Run 句柄不能为空");
        }
        long finishedAt = System.currentTimeMillis();
        String outputSha256 = output == null ? null : sha256(output);
        if (!repository.complete(handle.id(), status, outputSha256, error, finishedAt)) {
            throw new IllegalStateException("AI Run 已结束或不存在: " + handle.id());
        }
    }

    private static String abbreviate(String error) {
        String normalized = error == null || error.isBlank() ? "AI 调用失败" : error.trim();
        return normalized.length() <= MAX_ERROR_LENGTH
                ? normalized : normalized.substring(0, MAX_ERROR_LENGTH);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static String value(String value) {
        return value == null ? "" : value;
    }

    static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) {
            throw new IllegalStateException("计算 AI Run 哈希失败", error);
        }
    }

    /** 一次运行所需的非敏感业务上下文。 */
    public record RunContext(String sessionId, String engine, String model) {
        /** 返回无业务身份的上下文。 */
        public static RunContext empty() {
            return new RunContext(null, null, null);
        }
    }

    /** 调用方在运行结束和关联阶段持有的最小身份。 */
    public record RunHandle(String id, String inputFingerprint, String promptVersion) {
    }
}
