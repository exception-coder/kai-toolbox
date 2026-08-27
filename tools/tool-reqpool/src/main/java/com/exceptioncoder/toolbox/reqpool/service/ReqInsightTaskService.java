package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.reqpool.domain.ReqInsightRun;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import com.exceptioncoder.toolbox.reqpool.repository.ReqInsightRepository;
import com.exceptioncoder.toolbox.reqpool.repository.ReqInsightRunRepository;
import com.exceptioncoder.toolbox.reqpool.repository.ReqItemRepository;
import com.exceptioncoder.toolbox.reqpool.repository.ReqPlanningAssessmentRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.stereotype.Service;

import java.util.UUID;

/** 单条价值判定的幂等登记、后台执行和重启恢复入口。 */
@Slf4j
@Service
public class ReqInsightTaskService {

    private static final int MAX_ERROR_LENGTH = 500;

    private final ReqInsightRunRepository runRepository;
    private final ReqInsightRepository insightRepository;
    private final ReqItemRepository itemRepository;
    private final ReqPlanningAssessmentRepository planningRepository;
    private final ReqInsightApplicationService applicationService;
    private final ReqProjectEvidenceService projectEvidenceService;
    private final ReqInsightFingerprint fingerprint;
    private final ReqEvaluationRefreshOrchestrator refreshOrchestrator;
    private final AsyncTaskExecutor taskExecutor;

    public ReqInsightTaskService(
            ReqInsightRunRepository runRepository,
            ReqInsightRepository insightRepository,
            ReqItemRepository itemRepository,
            ReqPlanningAssessmentRepository planningRepository,
            ReqInsightApplicationService applicationService,
            ReqProjectEvidenceService projectEvidenceService,
            ReqInsightFingerprint fingerprint,
            ReqEvaluationRefreshOrchestrator refreshOrchestrator,
            AsyncTaskExecutor taskExecutor
    ) {
        this.runRepository = runRepository;
        this.insightRepository = insightRepository;
        this.itemRepository = itemRepository;
        this.planningRepository = planningRepository;
        this.applicationService = applicationService;
        this.projectEvidenceService = projectEvidenceService;
        this.fingerprint = fingerprint;
        this.refreshOrchestrator = refreshOrchestrator;
        this.taskExecutor = taskExecutor;
    }

    /** 冻结输入并快速登记；同一需求已有运行时直接复用。 */
    public ReqInsightRun schedule(ReqItem item, String requestedEngine) {
        ReqInsightRun active = runRepository.findActiveByItemId(item.getId()).orElse(null);
        if (active != null) return active;
        long now = System.currentTimeMillis();
        String evidenceTrace = planningRepository.findLatestByItemId(item.getId())
                .map(assessment -> assessment.getEvidenceTraceJson())
                .filter(value -> value != null && !value.isBlank())
                .orElse(null);
        ReqInsightRun run = new ReqInsightRun(
                UUID.randomUUID().toString(), item.getId(), item.getTitle(), item.getDescription(),
                item.getProject(), item.getModule(), fingerprint.sourceHash(item), evidenceTrace,
                ReqInsightApplicationService.normalizeItemEngine(requestedEngine), "RUNNING", "QUEUED",
                null, now, null, now, now);
        if (!runRepository.insert(run)) {
            return runRepository.findActiveByItemId(item.getId())
                    .orElseThrow(() -> new IllegalStateException("价值判定并发登记失败"));
        }
        taskExecutor.execute(() -> execute(run.id()));
        return run;
    }

    /** 执行已登记运行；成功洞察使用运行 ID，消除结果落库后的恢复歧义。 */
    public void execute(String runId) {
        ReqInsightRun run = runRepository.findById(runId).orElse(null);
        if (run == null || !"RUNNING".equals(run.status())) return;
        try {
            if (insightRepository.findById(run.id()).isEmpty()) {
                runRepository.markDiscovering(run.id(), System.currentTimeMillis());
                ReqItem snapshot = snapshot(run);
                String evidenceTrace = projectEvidenceService.capture(snapshot, run.engine())
                        .orElse(run.evidenceTraceJson());
                if (evidenceTrace != null && !evidenceTrace.equals(run.evidenceTraceJson())) {
                    runRepository.updateEvidenceTrace(run.id(), evidenceTrace, System.currentTimeMillis());
                }
                runRepository.markAnalyzing(run.id(), System.currentTimeMillis());
                applicationService.analyzeItem(run.id(), snapshot, run.engine(), evidenceTrace);
            }
            long completedAt = System.currentTimeMillis();
            runRepository.complete(run.id(), completedAt);
            itemRepository.findById(run.itemId())
                    .filter(current -> fingerprint.sourceHash(current).equals(run.sourceHash()))
                    .ifPresent(current -> refreshOrchestrator.refreshPlanningAfterInsight(current.getId()));
        } catch (RuntimeException error) {
            runRepository.fail(run.id(), errorMessage(error), System.currentTimeMillis());
            log.warn("[reqpool-insight] 后台价值判定失败 runId={} itemId={}", run.id(), run.itemId(), error);
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    public void recoverRunningInsights() {
        runRepository.findRunning().forEach(run -> taskExecutor.execute(() -> execute(run.id())));
    }

    private static ReqItem snapshot(ReqInsightRun run) {
        return ReqItem.builder().id(run.itemId()).title(run.titleSnapshot())
                .description(run.descriptionSnapshot()).project(run.projectSnapshot())
                .module(run.moduleSnapshot()).build();
    }

    private static String errorMessage(RuntimeException error) {
        String value = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
        String normalized = value.replace('\n', ' ').replace('\r', ' ').trim();
        return normalized.length() <= MAX_ERROR_LENGTH ? normalized : normalized.substring(0, MAX_ERROR_LENGTH);
    }
}
