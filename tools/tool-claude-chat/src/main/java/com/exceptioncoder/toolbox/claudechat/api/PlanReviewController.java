package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.PlanReviewService;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequireAuth
@RequestMapping("/api/claude-chat/sessions/{sessionId}/plan-reviews")
public class PlanReviewController {
    private final PlanReviewService service;
    public PlanReviewController(PlanReviewService service) { this.service = service; }
    @ModelAttribute
    public void noCache(jakarta.servlet.http.HttpServletResponse response) { response.setHeader("Cache-Control", "no-store"); }
    @GetMapping
    public List<PlanReviewService.Summary> list(@PathVariable String sessionId) { return service.list(sessionId); }
    @PostMapping
    public PlanReviewService.Batch create(@PathVariable String sessionId, @RequestBody PlanReviewService.Create command) {
        return service.create(sessionId, command);
    }
    @GetMapping("/{id}")
    public PlanReviewService.Batch get(@PathVariable String sessionId, @PathVariable String id) { return service.get(sessionId, id); }
    @PostMapping("/{id}/{engine}/retry")
    public PlanReviewService.Batch retry(@PathVariable String sessionId, @PathVariable String id,
                                        @PathVariable String engine, @RequestBody Retry command) {
        return service.retry(sessionId, id, engine, command.requestId());
    }
    @PostMapping("/{id}/{engine}/cancel")
    public PlanReviewService.Batch cancel(@PathVariable String sessionId, @PathVariable String id, @PathVariable String engine) {
        return service.cancel(sessionId, id, engine);
    }
    public record Retry(String requestId) {}
}
