package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.ReviewTodo;
import com.exceptioncoder.toolbox.claudechat.service.ReviewTodoService;
import org.springframework.web.bind.annotation.*;
import java.util.List;

/** 执行确认只提供在已认证的原会话接口，公开 token 没有确认入口。 */
@RestController
@RequestMapping("/api/claude-chat")
public class ReviewTodoController {
    private final ReviewTodoService service;
    public ReviewTodoController(ReviewTodoService service) { this.service = service; }
    @GetMapping("/sessions/{source}/review-todos")
    public List<ReviewTodo> list(@PathVariable String source) { return service.list(source); }
    @PostMapping("/sessions/{source}/review-todos/confirm")
    public List<ReviewTodo> confirm(@PathVariable String source, @RequestBody Confirm request) {
        return service.approve(source, request.items(), request.merge());
    }
    @PostMapping("/sessions/{source}/review-todos/import")
    public List<ReviewTodo> importFeedback(@PathVariable String source, @RequestBody Import request) {
        return service.importFeedback(source, request.feedbackIds());
    }
    @PatchMapping("/sessions/{source}/review-todos/{id}")
    public ReviewTodo edit(@PathVariable String source, @PathVariable String id, @RequestBody Edit request) {
        return service.edit(source, id, request.version(), request.title(), request.content());
    }
    @GetMapping("/reviews/public/{token}/tasks")
    public List<PublicTask> publicTasks(@PathVariable String token) {
        return service.publicList(token).stream().map(PublicTask::from).toList();
    }
    public record Confirm(List<ReviewTodoService.Selection> items, boolean merge) { }
    public record Import(List<String> feedbackIds) { }
    public record Edit(long version, String title, String content) { }
    /** 公开只投影原评审身份及状态，不暴露开发侧修订、队列身份或内部错误。 */
    public record PublicTask(String id, String requirementId, long sourceRevision, String status, long updatedAt) {
        static PublicTask from(ReviewTodo task) { return new PublicTask(task.id(), task.requirementId(), task.sourceRevision(), task.status(), task.updatedAt()); }
    }
}
