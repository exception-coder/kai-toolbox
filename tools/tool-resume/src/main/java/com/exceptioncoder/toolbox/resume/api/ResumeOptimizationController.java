package com.exceptioncoder.toolbox.resume.api;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import com.exceptioncoder.toolbox.resume.api.dto.ResumeOptimizationRequest;
import com.exceptioncoder.toolbox.resume.api.dto.ResumeOptimizationResponse;
import com.exceptioncoder.toolbox.resume.api.dto.WholeOptimizationRequest;
import com.exceptioncoder.toolbox.resume.api.dto.WholeOptimizationResponse;
import com.exceptioncoder.toolbox.resume.service.ResumeOptimizationService;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 简历 AI 优化入口。路径前缀 {@code /api/v1/resume} 由前端 optimize/api.ts 既有契约决定，
 * 与同模块的 {@link ResumeController}（{@code /api/resume}）刻意区分，勿混淆。
 */
@RestController
@RequestMapping("/api/v1/resume")
@RequireRole("ADMIN")
public class ResumeOptimizationController {

    private final ResumeOptimizationService service;

    public ResumeOptimizationController(ResumeOptimizationService service) {
        this.service = service;
    }

    /** 同步优化：等待完整结果（备用 / 测试路径）。 */
    @PostMapping("/optimize")
    public ResumeOptimizationResponse optimize(@Valid @RequestBody ResumeOptimizationRequest req) {
        return service.optimize(req);
    }

    /** 流式优化：SSE 推 {@code chunk} / {@code done}。前端 subscribeSsePost 用 fetch 读流。 */
    @PostMapping(value = "/optimize/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter optimizeStream(@Valid @RequestBody ResumeOptimizationRequest req) {
        // 0 = 永不超时；全局 spring.mvc.async.request-timeout 亦为 -1。
        SseEmitter emitter = new SseEmitter(0L);
        service.optimizeStream(req, emitter);
        return emitter;
    }

    /** 整篇优化：一次读全简历，返回多段建议（同步）。前端逐段 diff 采纳。 */
    @PostMapping("/optimize/whole")
    public WholeOptimizationResponse optimizeWhole(@Valid @RequestBody WholeOptimizationRequest req) {
        return service.optimizeWhole(req);
    }
}
