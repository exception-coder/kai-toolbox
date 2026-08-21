package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.api.dto.RegisterBugRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultBug;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTurn;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTurnExtraction;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnExtractionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnRepository;
import com.exceptioncoder.toolbox.llm.spi.BugExtractionRunner;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;

/**
 * 会话级 BUG 抽取编排：逐轮判定并把命中的缺陷登记进 consult_bug。
 *
 * <p>与「登记」本身解耦：判定口径在 {@link BugExtractionService}，去重与落库在 {@link BugService}，
 * 本类只负责「哪些轮该抽、抽完记账」。
 *
 * <p>幂等靠 consult_turn_extraction 的 answer_hash：前端每 1.5s 防抖同步一次且整表重写 consult_turn，
 * 没有台账的话同一段对话会被反复抽取——那是按次计费的推理，不是免费的循环。
 */
@Service
public class TurnBugExtractionService {

    private static final Logger log = LoggerFactory.getLogger(TurnBugExtractionService.class);

    private final ConsultTurnRepository turnRepo;
    private final ConsultTurnExtractionRepository extractionRepo;
    private final BugExtractionService extractionService;
    private final BugService bugService;
    private final Set<String> runningSessions = ConcurrentHashMap.newKeySet();
    private final Set<String> pendingSessions = ConcurrentHashMap.newKeySet();
    private final Set<String> pendingFullSessionExtractions = ConcurrentHashMap.newKeySet();

    public TurnBugExtractionService(ConsultTurnRepository turnRepo,
                                    ConsultTurnExtractionRepository extractionRepo,
                                    BugExtractionService extractionService,
                                    BugService bugService) {
        this.turnRepo = turnRepo;
        this.extractionRepo = extractionRepo;
        this.extractionService = extractionService;
        this.bugService = bugService;
    }

    /**
     * 对一个会话的所有轮次跑抽取。
     *
     * <p>阻塞在 LLM 上，调用方须保证运行在虚拟线程（见 {@code AgentOneShotRunner} 契约）；
     * 这里统一派发到虚拟线程再等结果，不依赖调用方线程模型。
     *
     * @param force true 时忽略 answer_hash 强制重抽，用于换了提示词版本后重跑
     */
    public Summary extractSession(String sessionId, String model, boolean force) {
        CompletableFuture<Summary> future = new CompletableFuture<>();
        Thread.ofVirtual().name("fore-consult-extract-" + sessionId).start(() -> {
            try {
                future.complete(doExtractSession(sessionId, model, force, true));
            } catch (Throwable t) {
                future.completeExceptionally(t);
            }
        });
        try {
            return future.get();
        } catch (ExecutionException e) {
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            if (cause instanceof RuntimeException re) {
                throw re;
            }
            throw new IllegalStateException(cause);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("抽取被中断");
        }
    }

    /** 归档后的非阻塞抽取，包含会话最后一轮。 */
    public void extractSessionAsync(String sessionId, String model) {
        requestSessionExtraction(sessionId, model, true);
    }

    /** 进行中同步后的非阻塞抽取，最后一轮留到下一次提问或归档后处理。 */
    public void extractCompletedTurnsAsync(String sessionId, String model) {
        requestSessionExtraction(sessionId, model, false);
    }

    private void requestSessionExtraction(String sessionId, String model, boolean includeLatestTurn) {
        if (includeLatestTurn) {
            pendingFullSessionExtractions.add(sessionId);
        }
        if (!runningSessions.add(sessionId)) {
            pendingSessions.add(sessionId);
            return;
        }
        Thread.ofVirtual().name("fore-consult-auto-extract-" + sessionId).start(() -> {
            try {
                do {
                    pendingSessions.remove(sessionId);
                    boolean includeLatest = pendingFullSessionExtractions.remove(sessionId);
                    Summary summary = doExtractSession(sessionId, model, false, includeLatest);
                    logSummary(summary);
                } while (pendingSessions.remove(sessionId));
            } catch (Exception e) {
                log.warn("[fore-consult] 会话 {} 自动 BUG 抽取失败: {}", sessionId, e.getMessage(), e);
            } finally {
                runningSessions.remove(sessionId);
                if (pendingSessions.remove(sessionId)) {
                    boolean includeLatest = pendingFullSessionExtractions.remove(sessionId);
                    requestSessionExtraction(sessionId, model, includeLatest);
                }
            }
        });
    }

    private void logSummary(Summary summary) {
        if (summary.extracted() > 0 || summary.failed() > 0) {
            log.info("[fore-consult] 会话 {} 自动 BUG 抽取完成: extracted={}, registered={}, skipped={}, failed={}",
                    summary.sessionId(), summary.extracted(), summary.registered(), summary.skipped(), summary.failed());
            return;
        }
        log.debug("[fore-consult] 会话 {} 自动 BUG 抽取无新增内容: skipped={}",
                summary.sessionId(), summary.skipped());
    }

    private Summary doExtractSession(String sessionId, String model, boolean force, boolean includeLatestTurn) {
        List<ConsultTurn> turns = turnRepo.findBySession(sessionId);
        int eligibleTurnCount = includeLatestTurn ? turns.size() : Math.max(0, turns.size() - 1);
        int skipped = turns.size() - eligibleTurnCount;
        int extracted = 0, registered = 0, failed = 0;

        for (int index = 0; index < eligibleTurnCount; index++) {
            ConsultTurn turn = turns.get(index);
            String answer = turn.getAnswer();
            if (answer == null || answer.isBlank()) {
                // 还没答完的轮次没什么可判的，跳过且不记台账——下次答案到位了自然会抽
                skipped++;
                continue;
            }
            String hash = sha256(answer);
            Optional<ConsultTurnExtraction> prior = extractionRepo.find(sessionId, turn.getTurnIndex());
            if (!force && prior.isPresent() && hash.equals(prior.get().getAnswerHash())) {
                skipped++;
                continue;
            }

            long now = System.currentTimeMillis();
            ConsultTurnExtraction.ConsultTurnExtractionBuilder row = ConsultTurnExtraction.builder()
                    .sessionId(sessionId)
                    .turnIndex(turn.getTurnIndex())
                    .answerHash(hash)
                    .extractedAt(now);
            try {
                BugExtractionRunner.Result result =
                        extractionService.extract(turn.getQuestion(), answer, model, null);
                extracted++;
                BugExtractionRunner.Extracted e = result.extracted();
                if (e == null) {
                    // 解析不出来不算「非缺陷」：那是未知，记 FAILED 并留 raw，否则会被当成判过而永久跳过
                    failed++;
                    extractionRepo.upsert(row.status("FAILED").isBug(null)
                            .promptVersion(result.promptVersion()).raw(result.raw())
                            .error("输出无法解析为 JSON").build());
                    continue;
                }
                if (e.isBug() && (e.title() == null || e.title().isBlank())) {
                    // 判定为缺陷却没给标题：BugService 直调不过 @NotBlank（那只在 Controller 生效），
                    // title().trim() 会直接 NPE；且标题是 dedup_key 的组成部分，缺了也无法去重。
                    failed++;
                    extractionRepo.upsert(row.status("FAILED").isBug(true)
                            .promptVersion(result.promptVersion()).raw(result.raw())
                            .error("判定为缺陷但未给出标题，无法登记").build());
                    continue;
                }
                String bugId = null;
                if (e.isBug()) {
                    ConsultBug bug = bugService.register(toRegisterRequest(sessionId, turn, e, answer));
                    bugId = bug.getBugId();
                    registered++;
                }
                extractionRepo.upsert(row.status("DONE").isBug(e.isBug()).bugId(bugId)
                        .promptVersion(result.promptVersion()).raw(result.raw()).build());
            } catch (Exception ex) {
                failed++;
                log.warn("[fore-consult] 会话 {} 第 {} 轮抽取失败: {}",
                        sessionId, turn.getTurnIndex(), ex.getMessage());
                extractionRepo.upsert(row.status("FAILED").isBug(null)
                        .error(truncate(ex.getMessage())).build());
            }
        }
        return new Summary(sessionId, turns.size(), extracted, registered, skipped, failed);
    }

    private static RegisterBugRequest toRegisterRequest(String sessionId, ConsultTurn turn,
                                                        BugExtractionRunner.Extracted e, String answer) {
        return new RegisterBugRequest(
                sessionId, turn.getTurnIndex(), e.title(), e.type(), e.severity(), e.module(),
                e.reproduce(), e.expected(), e.actual(), e.suspectArea(), e.confidence(),
                turn.getQuestion(), answer, null, null);
    }

    private static String sha256(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }

    private static String truncate(String s) {
        if (s == null) return "";
        return s.length() > 500 ? s.substring(0, 500) + "…" : s;
    }

    /**
     * @param total      会话总轮次
     * @param extracted  实际调用了抽取的轮次
     * @param registered 判定为缺陷并登记的轮次
     * @param skipped    因答案为空或内容未变而跳过的轮次
     * @param failed     调用或解析失败的轮次
     */
    public record Summary(String sessionId, int total, int extracted, int registered, int skipped, int failed) {
    }
}
