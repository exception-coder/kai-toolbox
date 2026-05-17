package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.api.dto.TaskView;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 多订阅广播器：任务中心页面打开后通过 {@link #register()} 拿到一条 SseEmitter，
 * SubtitleService / ScanService 在每次状态变化时调 {@link #broadcast(TaskView)} 把
 * 当前 TaskView 推给所有活跃订阅者。
 *
 * <p>与 {@link com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry} 是互补关系——
 * 那边按 jobId 维护「单订阅」频道（per-job 详情页用），这里维护「全局多订阅」频道
 * （任务中心列表页用）。
 */
@Component
public class TaskBroadcaster {

    private static final Logger log = LoggerFactory.getLogger(TaskBroadcaster.class);

    /** 1 小时超时与 SseEmitterRegistry 对齐；任务中心页面长时间打开也不会被框架截断。 */
    private static final long DEFAULT_TIMEOUT_MS = 60L * 60L * 1000L;

    private final Set<SseEmitter> subscribers = ConcurrentHashMap.newKeySet();

    public SseEmitter register() {
        SseEmitter emitter = new SseEmitter(DEFAULT_TIMEOUT_MS);
        subscribers.add(emitter);
        emitter.onCompletion(() -> subscribers.remove(emitter));
        emitter.onTimeout(() -> {
            subscribers.remove(emitter);
            emitter.complete();
        });
        emitter.onError(e -> subscribers.remove(emitter));
        return emitter;
    }

    public void broadcast(TaskView view) {
        if (subscribers.isEmpty()) return;
        for (SseEmitter emitter : subscribers) {
            try {
                emitter.send(SseEmitter.event().name("task").data(view));
            } catch (IOException | IllegalStateException e) {
                // 客户端已断开或 emitter 已 complete：当场剔除，下一轮就不再触达。
                subscribers.remove(emitter);
                try {
                    emitter.completeWithError(e);
                } catch (Exception ignored) {
                    // already completed
                }
                log.debug("TaskBroadcaster: 移除失效订阅者：{}", e.getMessage());
            }
        }
    }
}
