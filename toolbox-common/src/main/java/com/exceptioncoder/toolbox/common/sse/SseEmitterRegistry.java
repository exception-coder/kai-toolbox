package com.exceptioncoder.toolbox.common.sse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 按 key（通常是任务 ID）维护活跃的 {@link SseEmitter}。
 * 工具模块通过 {@link #publish(String, String, Object)} 推送事件到对应客户端。
 */
@Component
public class SseEmitterRegistry {

    private static final Logger log = LoggerFactory.getLogger(SseEmitterRegistry.class);
    private static final long DEFAULT_TIMEOUT_MS = 60L * 60L * 1000L; // 1h

    private final ConcurrentHashMap<String, SseEmitter> emitters = new ConcurrentHashMap<>();

    public SseEmitter create(String key) {
        SseEmitter emitter = new SseEmitter(DEFAULT_TIMEOUT_MS);
        emitter.onCompletion(() -> emitters.remove(key, emitter));
        emitter.onTimeout(() -> {
            emitters.remove(key, emitter);
            emitter.complete();
        });
        emitter.onError(e -> emitters.remove(key, emitter));
        emitters.put(key, emitter);
        return emitter;
    }

    public void publish(String key, String eventName, Object payload) {
        SseEmitter emitter = emitters.get(key);
        if (emitter == null) {
            return;
        }
        try {
            emitter.send(SseEmitter.event().name(eventName).data(payload));
        } catch (IOException | IllegalStateException e) {
            log.debug("SSE publish failed for key={}, removing emitter: {}", key, e.getMessage());
            emitters.remove(key, emitter);
            try {
                emitter.completeWithError(e);
            } catch (Exception ignored) {
                // already completed
            }
        }
    }

    public void complete(String key) {
        SseEmitter emitter = emitters.remove(key);
        if (emitter != null) {
            try {
                emitter.complete();
            } catch (Exception ignored) {
                // already completed
            }
        }
    }

    public boolean hasEmitter(String key) {
        return emitters.containsKey(key);
    }
}
