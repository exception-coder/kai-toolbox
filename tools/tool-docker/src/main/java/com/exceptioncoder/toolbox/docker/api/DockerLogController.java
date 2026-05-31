package com.exceptioncoder.toolbox.docker.api;

import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.exceptioncoder.toolbox.docker.api.dto.LogTailResponse;
import com.exceptioncoder.toolbox.docker.service.DockerService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.UUID;

@RestController
@RequestMapping("/api/docker")
public class DockerLogController {

    private final DockerService service;
    private final SseEmitterRegistry sseRegistry;

    public DockerLogController(DockerService service, SseEmitterRegistry sseRegistry) {
        this.service = service;
        this.sseRegistry = sseRegistry;
    }

    @GetMapping("/hosts/{hostId}/containers/{cid}/logs")
    public LogTailResponse tail(@PathVariable String hostId, @PathVariable String cid,
                                @RequestParam(required = false, defaultValue = "200") int tail,
                                @RequestParam(required = false) String since,
                                @RequestParam(required = false, defaultValue = "false") boolean timestamps) {
        int clampedTail = Math.max(1, Math.min(tail, 5000));
        return service.tailLogs(hostId, cid, clampedTail, since, timestamps);
    }

    @GetMapping(value = "/hosts/{hostId}/containers/{cid}/logs/stream",
            produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter follow(@PathVariable String hostId, @PathVariable String cid,
                             @RequestParam(required = false, defaultValue = "200") int tail,
                             @RequestParam(required = false) String since,
                             @RequestParam(required = false, defaultValue = "false") boolean timestamps) {
        int clampedTail = Math.max(0, Math.min(tail, 5000));
        // streamId 由 service 内生成，但要先创建 emitter 才能立刻挂回调；
        // 这里先生成 candidate id 作为 SseEmitterRegistry 的 key（即 streamId）
        String streamId = UUID.randomUUID().toString();
        SseEmitter emitter = sseRegistry.create(streamId);
        // chain cleanup：覆盖 sseRegistry.create 内的默认回调，
        // 但要同时执行"从 registry 移除"与"关 stream"两件事
        emitter.onCompletion(() -> {
            sseRegistry.complete(streamId);
            service.closeStream(streamId);
        });
        emitter.onTimeout(() -> {
            sseRegistry.complete(streamId);
            service.closeStream(streamId);
            try { emitter.complete(); } catch (Exception ignored) {}
        });
        emitter.onError(e -> {
            sseRegistry.complete(streamId);
            service.closeStream(streamId);
        });
        // 用 candidate streamId 替换 service 内部生成（保证 emitter key 与 stream key 一致）
        try {
            service.openLogStream(hostId, cid, clampedTail, since, timestamps, emitter, streamId);
        } catch (RuntimeException e) {
            sseRegistry.complete(streamId);
            throw e;
        }
        return emitter;
    }

    @DeleteMapping("/streams/{streamId}")
    public ResponseEntity<Void> closeStream(@PathVariable String streamId) {
        service.closeStream(streamId);
        return ResponseEntity.noContent().build();
    }
}
