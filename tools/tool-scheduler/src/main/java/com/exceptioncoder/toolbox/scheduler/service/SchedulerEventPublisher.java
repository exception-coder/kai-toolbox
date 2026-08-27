package com.exceptioncoder.toolbox.scheduler.service;

import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SchedulerEventPublisher {
    private final SseEmitterRegistry emitterRegistry;
    private final Set<String> clients = ConcurrentHashMap.newKeySet();

    public SchedulerEventPublisher(SseEmitterRegistry emitterRegistry) {
        this.emitterRegistry = emitterRegistry;
    }

    public SseEmitter subscribe() {
        String key = "scheduler:" + UUID.randomUUID();
        clients.add(key);
        SseEmitter emitter = emitterRegistry.create(key);
        emitter.onCompletion(() -> clients.remove(key));
        emitter.onTimeout(() -> clients.remove(key));
        emitter.onError(error -> clients.remove(key));
        return emitter;
    }

    public void publish(String event, Object payload) {
        clients.forEach(key -> emitterRegistry.publish(key, event, payload));
    }
}
