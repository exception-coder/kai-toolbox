package com.exceptioncoder.toolbox.foreconsult.suggestion;

import com.exceptioncoder.toolbox.common.requirement.RequirementRegistrationCommand;
import com.exceptioncoder.toolbox.common.requirement.RequirementRegistrationPort;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import jakarta.annotation.PreDestroy;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** 单工作者消费持久队列。模型审核在事务外，任务登记与接受状态在同一事务内。 */
@Component
public class ConsultSuggestionQueue {
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(ConsultSuggestionQueue.class);
    private final ConsultSuggestionRepository suggestions;
    private final ConsultSuggestionWorkRepository work;
    private final ConsultSuggestionReview review;
    private final ConsultSuggestionPatch patch;
    private final ObjectProvider<RequirementRegistrationPort> registration;
    private final TransactionTemplate transaction;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(Thread.ofVirtual().name("consult-suggestion-queue").factory());
    private final AtomicBoolean busy = new AtomicBoolean();
    private volatile boolean ready;

    public ConsultSuggestionQueue(ConsultSuggestionRepository suggestions, ConsultSuggestionWorkRepository work,
            ConsultSuggestionReview review, ConsultSuggestionPatch patch, ObjectProvider<RequirementRegistrationPort> registration,
            PlatformTransactionManager transactionManager) {
        this.suggestions = suggestions; this.work = work; this.review = review; this.patch = patch;
        this.registration = registration; this.transaction = new TransactionTemplate(transactionManager);
    }

    @EventListener(ApplicationReadyEvent.class)
    public void recover() { work.recoverInterrupted(); ready = true; }

    @Scheduled(fixedDelay = 15000, initialDelay = 15000)
    public void tick() {
        if (!ready || !busy.compareAndSet(false, true)) return;
        try { executor.submit(() -> { try { consumeOne(); } finally { busy.set(false); } }); }
        catch (RejectedExecutionException closed) { busy.set(false); }
    }

    void consumeOne() {
        var development = work.claim("QUEUED", "RUNNING");
        if (development.isPresent()) { develop(development.get()); return; }
        work.claim("REVIEW_PENDING", "REVIEWING").ifPresent(this::assess);
    }

    private void assess(String id) {
        try {
            var suggestion = suggestions.findById(id).orElseThrow();
            var result = review.review(suggestion);
            switch (result.decision()) {
                case REJECT_SCOPE, REJECT_PERMISSION -> work.finish(id, "REJECTED", result.reason(), null, null);
                case ACCEPT_SIMPLE, ACCEPT_COMPLEX -> transaction.executeWithoutResult(status -> {
                    var port = registration.getIfAvailable();
                    if (port == null) throw new IllegalStateException("需求队列不可用");
                    String description = "来源：业务咨询建议 " + id + "\n问题：" + suggestion.problem() + "\n期望：" + suggestion.expected()
                            + "\n完成标准：" + suggestion.acceptance() + "\n原文：" + suggestion.original()
                            + "\n审核：" + result.reason() + "\n仅授权咨询优化；禁止权限放开、自动合并、推送、重启或发布。";
                    String task = port.registerPendingExecutionOnce("consult-suggestion:" + id,
                            new RequirementRegistrationCommand(suggestion.title(), description, "kai-toolbox", "fore-consult", null));
                    work.finish(id, result.decision() == ConsultSuggestionReview.Decision.ACCEPT_SIMPLE ? "QUEUED" : "MANUAL_QUEUED", result.reason(), task, null);
                });
            }
        } catch (Exception error) {
            LOG.warn("咨询建议审核失败 suggestion={}", id, error);
            work.finish(id, "REVIEW_FAILED", "审核暂未完成，尚未进入开发队列；提交人可重试审核", null, null);
        }
    }

    private void develop(String id) {
        try {
            var result = patch.develop(suggestions.findById(id).orElseThrow());
            work.finish(id, result.commit() == null ? "MANUAL_QUEUED" : "COMMITTED", result.reason(), null, result.commit());
        } catch (Exception error) {
            LOG.warn("咨询建议自动开发未完成 suggestion={}", id, error);
            work.finish(id, "FAILED", "自动开发未通过，需求已保留；请维护人员查看日志和独立工作区接续", null, null);
        }
    }

    @PreDestroy public void close() { ready = false; executor.shutdownNow(); }
}
