package com.exceptioncoder.toolbox.prdclarify.api;

import com.exceptioncoder.toolbox.prdclarify.api.dto.AskNextQuestionRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.CreateSessionRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.PrdSessionView;
import com.exceptioncoder.toolbox.prdclarify.api.dto.SaveContentRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.SaveQaHistoryRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.SubmitAnswersRequest;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.exceptioncoder.toolbox.prdclarify.service.PrdClarifyService;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import static org.springframework.http.HttpStatus.NOT_FOUND;

/**
 * PRD 澄清工具 REST + SSE 端点。路径前缀 {@code /api/prd-clarify}。
 *
 * <ul>
 *   <li>{@code POST   /sessions}                 — 创建会话</li>
 *   <li>{@code GET    /sessions}                  — 最近 50 条历史</li>
 *   <li>{@code GET    /sessions/{id}}             — 获取会话详情</li>
 *   <li>{@code DELETE /sessions/{id}}             — 删除会话 + 文件</li>
 *   <li>{@code POST   /sessions/{id}/clarify}     — SSE：生成澄清问题</li>
 *   <li>{@code POST   /sessions/{id}/answers}     — 提交用户答案</li>
 *   <li>{@code POST   /sessions/{id}/generate}    — SSE：生成 PRD 文档</li>
 *   <li>{@code GET    /sessions/{id}/content}     — 读取 .md 文件</li>
 *   <li>{@code PUT    /sessions/{id}/content}     — 保存编辑后的 .md 文件</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/prd-clarify")
public class PrdClarifyController {

    private final PrdClarifyService service;
    private final PrdSessionRepository repo;

    public PrdClarifyController(PrdClarifyService service, PrdSessionRepository repo) {
        this.service = service;
        this.repo = repo;
    }

    /** 创建会话。 */
    @PostMapping("/sessions")
    public PrdSessionView create(@Valid @RequestBody CreateSessionRequest req) {
        PrdSession session = service.createSession(
                req.title(), req.rawInput(), req.project(), req.module(), req.model(), req.role());
        return PrdSessionView.from(session);
    }

    /** 历史列表（最近 50 条，按创建时间倒序）。 */
    @GetMapping("/sessions")
    public List<PrdSessionView> list() {
        return repo.findRecent(50).stream()
                .map(PrdSessionView::from)
                .toList();
    }

    /** 获取单条会话详情。 */
    @GetMapping("/sessions/{id}")
    public PrdSessionView get(@PathVariable String id) {
        return repo.findById(id)
                .map(PrdSessionView::from)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "会话不存在: " + id));
    }

    /** 删除会话（含 .md 文件）。 */
    @DeleteMapping("/sessions/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) throws IOException {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * SSE 流式：调 Claude 生成澄清问题。
     * 事件：chunk（content 增量）、done（完成）、error（失败）。
     * 前端用 subscribeSsePost 消费。
     */
    @PostMapping(value = "/sessions/{id}/clarify", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter clarify(@PathVariable String id) {
        SseEmitter emitter = new SseEmitter(0L);
        service.clarify(id, emitter);
        return emitter;
    }

    /**
     * 多轮渐进式澄清：请求 Claude 生成下一个问题（SSE 流式）。
     * 若 Claude 认为信息足够，流式输出 [CLARIFICATION_COMPLETE]，前端据此跳过后续提问直接生成 PRD。
     */
    @PostMapping(value = "/sessions/{id}/ask", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter ask(@PathVariable String id,
                          @RequestBody AskNextQuestionRequest req) {
        SseEmitter emitter = new SseEmitter(0L);
        service.askNextQuestion(id, req.questionIndex(), req.history(), emitter);
        return emitter;
    }

    /**
     * 多轮澄清完成后保存完整问答历史（替代 submitAnswers，携带每题的问题文本）。
     */
    @PostMapping("/sessions/{id}/qa-history")
    public PrdSessionView saveQaHistory(@PathVariable String id,
                                        @Valid @RequestBody SaveQaHistoryRequest req) {
        return PrdSessionView.from(service.saveQaHistory(id, req.history()));
    }

    /** 提交用户对澄清问题的回答。 */
    @PostMapping("/sessions/{id}/answers")
    public PrdSessionView submitAnswers(@PathVariable String id,
                                        @Valid @RequestBody SubmitAnswersRequest req) {
        PrdSession updated = service.submitAnswers(id, req.answers());
        return PrdSessionView.from(updated);
    }

    /**
     * SSE 流式：调 Claude 生成 PRD Markdown 文档。
     * 事件：chunk（content 增量）、done（完成）、error（失败）。
     */
    @PostMapping(value = "/sessions/{id}/generate", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter generate(@PathVariable String id) {
        SseEmitter emitter = new SseEmitter(0L);
        service.generate(id, emitter);
        return emitter;
    }

    /**
     * 读取 .md 文件内容。
     *
     * <p>{@code produces = APPLICATION_JSON_VALUE} 强制 Spring 使用 Jackson 序列化 {@code String}，
     * 返回带引号的 JSON 字符串（如 {@code "# PRD..."}），与前端 {@code http<string>()} 的
     * {@code res.json()} 调用兼容。若不加此注解，{@code StringHttpMessageConverter} 会以
     * {@code text/plain} 返回裸字符串，导致前端 JSON.parse 失败。
     */
    @GetMapping(value = "/sessions/{id}/content", produces = MediaType.APPLICATION_JSON_VALUE)
    public String getContent(@PathVariable String id) throws IOException {
        return service.readContent(id);
    }

    /** 保存用户编辑后的 PRD 文档（覆盖 .md 文件）。 */
    @PutMapping("/sessions/{id}/content")
    public ResponseEntity<Void> saveContent(@PathVariable String id,
                                             @Valid @RequestBody SaveContentRequest req) throws IOException {
        service.saveContent(id, req.content());
        return ResponseEntity.ok().build();
    }

    /** 测试用：获取 PRD 文件路径（方便定位文件）。 */
    @GetMapping("/sessions/{id}/path")
    public Map<String, String> getPath(@PathVariable String id) {
        return repo.findById(id)
                .map(s -> Map.of("mdPath", s.getMdPath() != null ? s.getMdPath() : ""))
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "会话不存在: " + id));
    }
}
