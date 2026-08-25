package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Service;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 本地代码分析后台任务编排：持久化状态、幂等启动，并在应用重启时收敛遗留运行态。
 */
@Slf4j
@Service
public class PrdProgressEvaluationTaskService implements ApplicationRunner {

    private static final String INITIAL_STAGE = "正在准备本地代码分析";

    private final PrdSessionRepository repository;
    private final PrdProgressEvaluationService evaluationService;
    private final Set<String> activeSessions = ConcurrentHashMap.newKeySet();

    public PrdProgressEvaluationTaskService(PrdSessionRepository repository,
                                            PrdProgressEvaluationService evaluationService) {
        this.repository = repository;
        this.evaluationService = evaluationService;
    }

    /** 登记后台任务并立即返回；同一会话已有运行任务时直接复用。 */
    public PrdSession start(String sessionId, String extraContext) {
        PrdSession session = requireSession(sessionId);
        if ("RUNNING".equals(session.getProgressWorkStatus())) {
            return session;
        }
        if (!activeSessions.add(sessionId)) {
            return requireSession(sessionId);
        }

        long startedAt = System.currentTimeMillis();
        try {
            repository.updateProgressWorkSnapshot(
                    sessionId, "RUNNING", INITIAL_STAGE, null, startedAt, null, startedAt);
            Thread.ofVirtual().name("prd-progress-evaluate-" + sessionId + "-").start(
                    () -> execute(sessionId, extraContext, startedAt));
        } catch (RuntimeException exception) {
            activeSessions.remove(sessionId);
            throw exception;
        }
        return requireSession(sessionId);
    }

    private void execute(String sessionId, String extraContext, long startedAt) {
        try {
            evaluationService.evaluateSynchronously(sessionId, extraContext,
                    stage -> repository.updateProgressWorkSnapshot(
                            sessionId, "RUNNING", stage, null, startedAt, null,
                            System.currentTimeMillis()));
            long completedAt = System.currentTimeMillis();
            repository.updateProgressWorkSnapshot(
                    sessionId, "COMPLETED", "本地代码分析已完成", null,
                    startedAt, completedAt, completedAt);
        } catch (Exception exception) {
            long completedAt = System.currentTimeMillis();
            String message = readableMessage(exception);
            repository.updateProgressWorkSnapshot(
                    sessionId, "ERROR", "本地代码分析失败", message,
                    startedAt, completedAt, completedAt);
            log.warn("[prd-clarify] 本地代码分析后台任务失败 sessionId={}", sessionId, exception);
        } finally {
            activeSessions.remove(sessionId);
        }
    }

    @Override
    public void run(ApplicationArguments args) {
        long recoveredAt = System.currentTimeMillis();
        int recovered = repository.failInterruptedProgressWork(
                "服务已重启，原本地代码分析无法跨进程继续；可重新发起分析",
                recoveredAt);
        if (recovered > 0) {
            log.warn("[prd-clarify] 已收敛 {} 个进程重启前遗留的本地代码分析任务", recovered);
        }
    }

    private PrdSession requireSession(String sessionId) {
        return repository.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("PRD session not found: " + sessionId));
    }

    private static String readableMessage(Exception exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? exception.getClass().getSimpleName() : message;
    }
}
