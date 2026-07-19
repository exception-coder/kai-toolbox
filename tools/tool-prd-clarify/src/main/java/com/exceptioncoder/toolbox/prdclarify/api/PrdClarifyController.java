package com.exceptioncoder.toolbox.prdclarify.api;

import com.exceptioncoder.toolbox.prdclarify.api.dto.AskNextQuestionRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.CreateSessionRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.GenerateDevDocRequest;
import com.exceptioncoder.toolbox.prdclarify.service.AttachmentParseService;
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
    private final AttachmentParseService attachmentParser;

    public PrdClarifyController(PrdClarifyService service, PrdSessionRepository repo,
                                AttachmentParseService attachmentParser) {
        this.service = service;
        this.repo = repo;
        this.attachmentParser = attachmentParser;
    }

    /**
     * 附件文本提取：上传 Markdown / PDF / Word 文件，返回提取的文本内容。
     * 前端将提取的文本追加到 rawInput 后再创建会话。
     * 支持格式：.md / .txt / .pdf / .docx / .doc，单文件最大 20MB。
     */
    @PostMapping(value = "/attachments/parse", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<AttachmentParseService.ParseResult> parseAttachment(
            @org.springframework.web.bind.annotation.RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        if (file.isEmpty()) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "文件不能为空");
        }
        if (!attachmentParser.isSupported(file)) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,
                    "不支持的文件格式，请上传 .md / .pdf / .docx 文件");
        }
        try {
            return ResponseEntity.ok(attachmentParser.parse(file));
        } catch (Exception e) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR,
                    "文件解析失败：" + e.getMessage());
        }
    }

    /** 创建会话。 */
    @PostMapping("/sessions")
    public PrdSessionView create(@Valid @RequestBody CreateSessionRequest req) {
        PrdSession session = service.createSession(
                req.title(), req.rawInput(), req.project(), req.module(), req.model(), req.role(),
                req.reqType(), req.maxQuestions());
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

    /**
     * 检查 PRD 文件是否已由 Vibe Coding 会话写入（Claude 通过 file_write 工具写入后调用此接口）。
     * 若文件存在则更新会话状态为 DONE，使 prd-clarify 页面可刷新到编辑器。
     * 与 feature-dev 澄清流程配合：Claude 完成澄清后写文件，前端轮询此接口确认。
     */
    @PostMapping("/sessions/{id}/check-prd-file")
    public ResponseEntity<PrdSessionView> checkPrdFile(@PathVariable String id) {
        com.exceptioncoder.toolbox.prdclarify.domain.PrdSession session = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "会话不存在: " + id));

        // 检查文件是否存在（Claude 可能已写入，也可能还未完成）
        java.nio.file.Path mdPath = service.getPrdFilePath(id);
        if (java.nio.file.Files.exists(mdPath) && "DONE".equals(session.getStatus())) {
            return ResponseEntity.ok(PrdSessionView.from(session));
        }
        if (java.nio.file.Files.exists(mdPath)) {
            try {
                // 文件已存在但状态未更新，更新状态
                repo.updateDone(id, mdPath.toString());
            } catch (Exception e) {
                // 状态更新失败不阻断主流程，文件已存在即可读取
            }
            return ResponseEntity.ok(
                    repo.findById(id).map(PrdSessionView::from)
                            .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "会话不存在: " + id)));
        }
        // 文件还不存在
        return ResponseEntity.ok(PrdSessionView.from(session));
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

    // ─── 开发文档 ───────────────────────────────────────

    /**
     * 关联 Vibe Coding 开发会话：「开始开发」跳转到 claude-chat 后，由前端回写 devSessionId，
     * 建立 PRD ↔ 开发会话的双向关联，使 PRD 页面可以直接跳回对应的 Vibe Coding 会话。
     */
    @PostMapping("/sessions/{id}/link-dev-session")
    public ReqItemLinkResult linkDevSession(@PathVariable String id,
                                              @RequestBody java.util.Map<String, String> body) {
        String devSessionId = body.get("devSessionId");
        if (devSessionId == null || devSessionId.isBlank()) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "devSessionId 不能为空");
        }
        repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "会话不存在: " + id));
        repo.updateDevSessionId(id, devSessionId);
        return new ReqItemLinkResult(true);
    }

    record ReqItemLinkResult(boolean ok) {}

    /**
     * SSE 流式：基于 PRD 生成技术开发方案文档（四章节：技术方案/DB变更/API设计/实现步骤）。
     * 事件：chunk / done / error（与 PRD 生成接口一致）。
     *
     * <p>请求体可选携带 extraInstructions——前端「生成开发文档」弹框里用户补充的自定义提示词，
     * 不生成/重新生成前不再直接触发，先让用户确认要不要额外交代点什么再点确认。</p>
     */
    @PostMapping(value = "/sessions/{id}/dev-doc", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter generateDevDoc(@PathVariable String id,
                                      @RequestBody(required = false) GenerateDevDocRequest req) {
        SseEmitter emitter = new SseEmitter(0L);
        service.generateDevDoc(id, req == null ? null : req.extraInstructions(), emitter);
        return emitter;
    }

    /** 读取开发文档内容（JSON 字符串格式，与 /content 保持一致）。 */
    @GetMapping(value = "/sessions/{id}/dev-doc", produces = MediaType.APPLICATION_JSON_VALUE)
    public String getDevDocContent(@PathVariable String id) throws IOException {
        return service.readDevDocContent(id);
    }

    /** 保存用户编辑后的开发文档。 */
    @PutMapping("/sessions/{id}/dev-doc")
    public ResponseEntity<Void> saveDevDocContent(@PathVariable String id,
                                                   @Valid @RequestBody SaveContentRequest req) throws IOException {
        service.saveDevDocContent(id, req.content());
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
