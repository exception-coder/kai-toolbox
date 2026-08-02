package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdDocChangeCandidate;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdDocChangeCandidateRepository;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Duration;
import java.util.List;
import java.util.Set;

/** 将候选对应的 PRD/TDD 更新完全放在后端执行，浏览器断开不影响模型任务和落盘。 */
@Slf4j
@Service
public class PrdDocChangeApplyService {
    private static final Duration MAX_STAGE_TIME = Duration.ofHours(2);

    private final PrdDocChangeAnalysisService analysisService;
    private final PrdClarifyService clarifyService;
    private final PrdDocChangeCandidateRepository candidateRepository;
    private final PrdSessionRepository sessionRepository;

    public PrdDocChangeApplyService(PrdDocChangeAnalysisService analysisService,
                                    PrdClarifyService clarifyService,
                                    PrdDocChangeCandidateRepository candidateRepository,
                                    PrdSessionRepository sessionRepository) {
        this.analysisService = analysisService;
        this.clarifyService = clarifyService;
        this.candidateRepository = candidateRepository;
        this.sessionRepository = sessionRepository;
    }

    /** 持久化 APPLYING 后立即返回；后续阶段由独立虚拟线程推进。 */
    public PrdDocChangeCandidate start(String candidateId, String engine, String extraInstructions) {
        PrdDocChangeCandidate candidate = requireCandidate(candidateId);
        if (!Set.of("PRD_ONLY", "TDD_ONLY", "BOTH").contains(candidate.getDecision())) {
            throw new IllegalStateException("当前 AI 结论没有可执行的 PRD/TDD 更新范围");
        }
        if ("APPLYING".equals(candidate.getStatus())) return candidate;
        if ("APPLIED".equals(candidate.getStatus())) return candidate;
        if (!Set.of("PENDING", "CONFIRMED", "PARTIAL").contains(candidate.getStatus())) {
            throw new IllegalStateException("当前候选状态不能启动后台更新: " + candidate.getStatus());
        }

        sessionRepository.updateEngine(candidate.getPrdSessionId(), normalizeEngine(engine));
        PrdDocChangeCandidate current = candidate;
        boolean recoveredPrdAlreadyFinished = "PARTIAL".equals(current.getStatus())
                && "PRD".equals(current.getApplyStage()) && prdFinishedAfterCandidate(current);
        String note = buildUpdateNote(current, extraInstructions);
        if (current.getRevisionSessionId() == null || current.getRevisionSessionId().isBlank()) {
            try {
                PrdSession revision = recoveredPrdAlreadyFinished
                        ? clarifyService.recoverInPlacePrdAsBackgroundRevision(
                                current.getPrdSessionId(), current.getChangeCauseDetail())
                        : clarifyService.createBackgroundRevision(
                                current.getPrdSessionId(), current.getChangeCauseDetail());
                sessionRepository.updateEngine(revision.getId(), normalizeEngine(engine));
                candidateRepository.updateRevisionSession(candidateId, revision.getId());
                current = requireCandidate(candidateId);
            } catch (Exception e) {
                throw new IllegalStateException("创建 PRD 修订版本节点失败: " + message(e), e);
            }
        }
        if ("PENDING".equals(current.getStatus())) {
            current = analysisService.applyAction(candidateId, "CONFIRM", null);
        }
        String stage = current.getApplyStage();
        if ("PRD".equals(stage)) {
            current = analysisService.applyAction(candidateId, "START_PRD", null);
            if (recoveredPrdAlreadyFinished) {
                current = analysisService.applyAction(candidateId,
                        "PRD_ONLY".equals(current.getDecision()) ? "PRD_ONLY_SUCCESS" : "PRD_SUCCESS", null);
                if ("APPLIED".equals(current.getStatus())) return current;
                current = analysisService.applyAction(candidateId, "START_TDD", null);
            }
        }
        else if ("TDD".equals(stage)) current = analysisService.applyAction(candidateId, "START_TDD", null);
        else throw new IllegalStateException("候选没有可执行阶段: " + stage);

        Thread.ofVirtual().name("prd-doc-change-apply-").start(() -> run(candidateId, note));
        return current;
    }

    private void run(String candidateId, String note) {
        try {
            PrdDocChangeCandidate current = requireCandidate(candidateId);
            String targetSessionId = targetSessionId(current);
            if ("PRD".equals(current.getApplyStage())) {
                runPrd(targetSessionId, note);
                current = analysisService.applyAction(candidateId,
                        "PRD_ONLY".equals(current.getDecision()) ? "PRD_ONLY_SUCCESS" : "PRD_SUCCESS", null);
                if ("APPLIED".equals(current.getStatus())) return;
                current = analysisService.applyAction(candidateId, "START_TDD", null);
            }
            if ("TDD".equals(current.getApplyStage())) {
                runTdd(targetSessionId, note);
                analysisService.applyAction(candidateId, "TDD_SUCCESS", null);
            }
        } catch (Exception e) {
            log.warn("[prd-clarify] 后台文档更新失败 candidateId={}", candidateId, e);
            try {
                PrdDocChangeCandidate current = requireCandidate(candidateId);
                if ("APPLYING".equals(current.getStatus())) {
                    analysisService.applyAction(candidateId, "FAIL", message(e));
                }
            } catch (Exception stateError) {
                log.error("[prd-clarify] 登记后台文档更新失败状态失败 candidateId={}", candidateId, stateError);
            }
        }
    }

    private void runPrd(String sessionId, String note) throws InterruptedException {
        clarifyService.generate(sessionId, note, true, true, new SseEmitter(0L));
        await(sessionId, true);
    }

    private void runTdd(String sessionId, String note) throws InterruptedException {
        clarifyService.generateDevDoc(sessionId, note, true, List.of(), true, true, new SseEmitter(0L));
        await(sessionId, false);
    }

    private void await(String sessionId, boolean prd) throws InterruptedException {
        long deadline = System.nanoTime() + MAX_STAGE_TIME.toNanos();
        while (System.nanoTime() < deadline) {
            PrdSession session = sessionRepository.findById(sessionId)
                    .orElseThrow(() -> new IllegalStateException("PRD 会话不存在: " + sessionId));
            String status = prd ? session.getStatus() : session.getDevDocWorkStatus();
            if ("DONE".equals(status)) return;
            if ("ERROR".equals(status)) {
                String error = prd ? session.getErrorMsg() : session.getDevDocWorkError();
                throw new IllegalStateException(error == null ? "文档后台更新失败" : error);
            }
            Thread.sleep(500);
        }
        throw new IllegalStateException((prd ? "PRD" : "TDD") + " 后台更新超过两小时");
    }

    private PrdDocChangeCandidate requireCandidate(String id) {
        return candidateRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("文档变更候选不存在: " + id));
    }

    private boolean prdFinishedAfterCandidate(PrdDocChangeCandidate candidate) {
        return sessionRepository.findById(candidate.getPrdSessionId())
                .map(session -> session.getPrdGeneratedAt() != null
                        && session.getPrdGeneratedAt() > candidate.getUpdatedAt())
                .orElse(false);
    }

    private static String targetSessionId(PrdDocChangeCandidate candidate) {
        return candidate.getRevisionSessionId() == null || candidate.getRevisionSessionId().isBlank()
                ? candidate.getPrdSessionId() : candidate.getRevisionSessionId();
    }

    private static String buildUpdateNote(PrdDocChangeCandidate candidate, String extra) {
        StringBuilder note = new StringBuilder();
        note.append("变更原因分类：").append(value(candidate.getChangeCauseType())).append('\n');
        note.append("AI 变更原因：").append(value(candidate.getChangeCauseDetail())).append('\n');
        note.append("分析摘要：").append(value(candidate.getSummary())).append('\n');
        note.append("判断理由：").append(value(candidate.getReasoning())).append('\n');
        note.append("PRD 修改计划：").append(value(candidate.getPrdPatchPlanJson())).append('\n');
        note.append("TDD 修改计划：").append(value(candidate.getTddPatchPlanJson())).append('\n');
        if (extra != null && !extra.isBlank()) note.append("额外约束：").append(extra.trim()).append('\n');
        return note.toString();
    }

    private static String normalizeEngine(String engine) {
        return "codex".equalsIgnoreCase(engine) ? "codex" : "claude";
    }

    private static String value(String value) { return value == null ? "" : value; }
    private static String message(Exception e) { return e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage(); }
}
