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
    private final ConsultDevelopmentSession session;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(Thread.ofVirtual().name("consult-suggestion-queue").factory());
    private final AtomicBoolean busy = new AtomicBoolean();
    private volatile boolean ready;

    public ConsultSuggestionQueue(ConsultSuggestionRepository suggestions, ConsultSuggestionWorkRepository work,
            ConsultSuggestionReview review, ConsultSuggestionPatch patch, ObjectProvider<RequirementRegistrationPort> registration,
            PlatformTransactionManager transactionManager, ConsultDevelopmentSession session) {
        this.suggestions = suggestions; this.work = work; this.review = review; this.patch = patch;
        this.registration = registration; this.transaction = new TransactionTemplate(transactionManager);
        this.session = session;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void recover() {
        var interrupted = work.interruptedIds();
        work.recoverInterrupted();
        for (String id : interrupted) {
            try {
                transaction.executeWithoutResult(status -> updateTask(suggestions.findById(id).orElseThrow(), RequirementRegistrationPort.ImplementationStatus.PENDING_EXECUTION));
                session.append(id, "待实现", "上次开发被中断，已保留工作区，等待核对后接续");
            } catch (Exception error) { LOG.warn("中断任务状态回写待核对 suggestion={}", id, error); }
        }
        ready = true;
    }

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
            session.append(id, "需求审核", "收到建议：" + suggestion.title() + "；开始审核咨询范围和权限边界");
            var result = review.review(suggestion);
            switch (result.decision()) {
                case REJECT_SCOPE, REJECT_PERMISSION -> {
                    work.finish(id, "REJECTED", result.reason(), null, null);
                    session.append(id, "审核未通过", result.reason());
                }
                case ACCEPT_SIMPLE, ACCEPT_COMPLEX -> transaction.executeWithoutResult(status -> {
                    var port = registration.getIfAvailable();
                    if (port == null) throw new IllegalStateException("需求队列不可用");
                    String description = "来源：业务咨询建议 " + id + "\n问题：" + suggestion.problem() + "\n期望：" + suggestion.expected()
                            + "\n完成标准：" + suggestion.acceptance() + "\n原文：" + suggestion.original()
                            + "\n审核：" + result.reason() + "\n仅授权咨询优化；禁止权限放开、自动合并、推送、重启或发布。";
                    String task = port.registerPendingExecutionOnce("consult-suggestion:" + id,
                            new RequirementRegistrationCommand(suggestion.title(), description, "kai-toolbox", "fore-consult", null));
                    work.finish(id, result.decision() == ConsultSuggestionReview.Decision.ACCEPT_SIMPLE ? "QUEUED" : "MANUAL_QUEUED", result.reason(), task, null);
                    session.append(id, "待实现", "审核已接收：" + suggestion.title() + (result.decision() == ConsultSuggestionReview.Decision.ACCEPT_SIMPLE ? "；已排入后台开发队列" : "；超出自动展示修改范围，待人工接续"));
                });
            }
        } catch (Exception error) {
            LOG.warn("咨询建议审核失败 suggestion={}", id, error);
            work.finish(id, "REVIEW_FAILED", "审核暂未完成，尚未进入开发队列；提交人可重试审核", null, null);
            session.append(id, "审核中断", "审核未完成，未放行到开发队列");
        }
    }

    private void develop(String id) {
        ConsultSuggestionPatch.Result result = null;
        try {
            var suggestion = suggestions.findById(id).orElseThrow();
            transaction.executeWithoutResult(status -> updateTask(suggestion, RequirementRegistrationPort.ImplementationStatus.IN_DEV));
            session.append(id, "实现中", "开始实现：" + suggestion.title() + "；离开页面不会中断后台编码");
            result = patch.develop(suggestion);
            var completed = result;
            transaction.executeWithoutResult(status -> {
                updateTask(suggestion, completed.commit() == null ? RequirementRegistrationPort.ImplementationStatus.PENDING_EXECUTION : RequirementRegistrationPort.ImplementationStatus.READY_FOR_RELEASE);
                work.finish(id, completed.commit() == null ? "MANUAL_QUEUED" : "COMMITTED", completed.reason(), null, completed.commit());
                session.append(id, completed.commit() == null ? "待实现" : "待发布", completed.reason());
            });
        } catch (Exception error) {
            LOG.warn("咨询建议自动开发未完成 suggestion={}", id, error);
            if (result != null && result.commit() != null) {
                work.finish(id, "COMMITTED", "代码已提交，需求池状态回写待核对；尚未发布", null, result.commit());
            } else {
                try {
                    transaction.executeWithoutResult(status -> updateTask(suggestions.findById(id).orElseThrow(), RequirementRegistrationPort.ImplementationStatus.PENDING_EXECUTION));
                } catch (Exception syncError) { LOG.warn("需求状态回写待核对 suggestion={}", id, syncError); }
                work.finish(id, "FAILED", "自动开发未通过，保留需求与工作区等待接续；需求池状态如有变化请人工核对", null, null);
            }
            session.append(id, "需要接续", "自动推进未完成，请核对需求状态、检查结果和独立工作区");
        }
    }

    private void updateTask(ConsultSuggestion suggestion, RequirementRegistrationPort.ImplementationStatus status) {
        var port = registration.getIfAvailable();
        if (port == null) throw new IllegalStateException("需求队列不可用");
        port.updateImplementationStatus("consult-suggestion:" + suggestion.id(), suggestion.requirementId(), status);
    }

    @PreDestroy public void close() { ready = false; executor.shutdownNow(); }
}
