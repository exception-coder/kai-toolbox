package com.exceptioncoder.toolbox.prdclarify.api;

import com.exceptioncoder.toolbox.prdclarify.api.dto.AskNextDevDocQuestionRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.AskNextQuestionRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.CreateSessionRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.DevDocVersionSummary;
import com.exceptioncoder.toolbox.prdclarify.api.dto.EstimateEffortRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.GenerateDevDocRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.ImageAttachmentView;
import com.exceptioncoder.toolbox.prdclarify.service.AttachmentParseService;
import com.exceptioncoder.toolbox.prdclarify.service.ImageAttachmentStorageService;
import com.exceptioncoder.toolbox.prdclarify.api.dto.PrdSessionView;
import com.exceptioncoder.toolbox.prdclarify.api.dto.SaveContentRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.SaveQaHistoryRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.SubmitAnswersRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.UpdateTitleRequest;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.exceptioncoder.toolbox.prdclarify.service.PrdClarifyService;
import com.exceptioncoder.toolbox.common.auth.domain.AuthUser;
import com.exceptioncoder.toolbox.common.auth.repository.AuthUserRepository;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
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
import java.util.Optional;

import static org.springframework.http.HttpStatus.NOT_FOUND;

/**
 * PRD 澄清工具 REST + SSE 端点。路径前缀 {@code /api/prd-clarify}。
 *
 * <ul>
 *   <li>{@code POST   /sessions}                 — 创建会话</li>
 *   <li>{@code GET    /sessions}                  — 最近 50 条历史</li>
 *   <li>{@code GET    /sessions/{id}}             — 获取会话详情</li>
 *   <li>{@code PUT    /sessions/{id}/title}       — 重命名会话标题</li>
 *   <li>{@code DELETE /sessions/{id}}             — 删除会话 + 文件</li>
 *   <li>{@code POST   /sessions/{id}/clarify}     — SSE：生成澄清问题</li>
 *   <li>{@code POST   /sessions/{id}/answers}     — 提交用户答案</li>
 *   <li>{@code POST   /sessions/{id}/generate}    — SSE：生成 PRD 文档</li>
 *   <li>{@code GET    /sessions/{id}/content}     — 读取 .md 文件</li>
 *   <li>{@code PUT    /sessions/{id}/content}     — 保存编辑后的 .md 文件</li>
 *   <li>{@code POST   /sessions/{id}/dev-doc/estimate} — AI 工时评估</li>
 *   <li>{@code POST   /sessions/{id}/link-dev-session} — 关联 Vibe Coding 开发会话</li>
 *   <li>{@code POST   /sessions/{id}/unlink-dev-session} — 取消关联 Vibe Coding 开发会话</li>
 *   <li>{@code GET    /sessions/by-dev-session/{devSessionId}} — 按开发会话反查关联 PRD</li>
 *   <li>{@code GET    /sessions/by-dev-sessions?ids=...}   — 批量反查关联 PRD</li>
 *   <li>{@code POST   /attachments/image}         — 粘贴图片落盘</li>
 *   <li>{@code GET    /attachments/image/{id}}    — 取回图片</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/prd-clarify")
public class PrdClarifyController {

    private final PrdClarifyService service;
    private final PrdSessionRepository repo;
    private final AttachmentParseService attachmentParser;
    private final ImageAttachmentStorageService imageAttachmentStorage;
    /** Optional：toolbox.auth.enabled=false 时这个 bean 不存在，历史列表退化为不展示创建人用户名。 */
    private final Optional<AuthUserRepository> authUserRepo;

    public PrdClarifyController(PrdClarifyService service, PrdSessionRepository repo,
                                AttachmentParseService attachmentParser,
                                ImageAttachmentStorageService imageAttachmentStorage,
                                Optional<AuthUserRepository> authUserRepo) {
        this.service = service;
        this.repo = repo;
        this.attachmentParser = attachmentParser;
        this.imageAttachmentStorage = imageAttachmentStorage;
        this.authUserRepo = authUserRepo;
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

    /**
     * "原始需求描述"文本域直接粘贴图片：落盘（见 {@link ImageAttachmentStorageService}），
     * 返回可用于 {@code <img src>} 的相对地址，前端把 {@code ![粘贴图片N](url)} 插进文本域，
     * 图片随文字一起构成 rawInput。此时 PRD 会话通常还没创建，接口本身不关联 sessionId。
     */
    @PostMapping(value = "/attachments/image", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ImageAttachmentView uploadImage(
            @org.springframework.web.bind.annotation.RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        return imageAttachmentStorage.store(file);
    }

    /** 取回粘贴/上传的图片原始字节，供 {@code <img src>} 直接引用。 */
    @GetMapping("/attachments/image/{id}")
    public ResponseEntity<org.springframework.core.io.Resource> downloadImage(@PathVariable String id) {
        ImageAttachmentStorageService.DownloadFile f = imageAttachmentStorage.locate(id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(f.mime()))
                .body(new org.springframework.core.io.FileSystemResource(f.path()));
    }

    /** 创建会话，归属写成当前登录用户（未登录/鉴权关闭时为 null，历史列表按此退回旧的全局视图）。 */
    @PostMapping("/sessions")
    public PrdSessionView create(@Valid @RequestBody CreateSessionRequest req) {
        Long createdByUserId = AuthContext.current().map(AuthPrincipal::userId).orElse(null);
        PrdSession session = service.createSession(
                req.title(), req.rawInput(), req.project(), req.module(), req.model(), req.role(),
                req.reqType(), req.maxQuestions(), createdByUserId, req.clarifyMode());
        return PrdSessionView.from(session);
    }

    /**
     * 历史列表（最近 50 条，按创建时间倒序）。按用户隔离：普通登录用户只看自己创建的会话；
     * ADMIN 角色可见全部（超级权限，跟公司其它管理后台的惯例一致）；未登录/鉴权关闭时退回
     * 旧的"全局最近 50 条"行为，兼容单用户场景。
     */
    @GetMapping("/sessions")
    public List<PrdSessionView> list() {
        Optional<AuthPrincipal> principal = AuthContext.current();
        List<PrdSession> sessions;
        if (principal.isEmpty() || principal.get().hasAnyRole("ADMIN")) {
            sessions = repo.findRecent(50);
        } else {
            sessions = repo.findRecentByUser(50, principal.get().userId());
        }
        // 批量查一次全部用户名（这个工具的用户数量级不会大，findAll() 一次够用），
        // 避免给每条历史记录单独查一次 auth_user——主要给 ADMIN 视角区分"这条是谁的"。
        Map<Long, String> usernameById = authUserRepo
                .map(r -> r.findAll().stream()
                        .collect(java.util.stream.Collectors.toMap(AuthUser::getId, AuthUser::getUsername)))
                .orElse(Map.of());
        return sessions.stream()
                .map(s -> PrdSessionView.from(s, usernameById.get(s.getCreatedByUserId())))
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

    /** 重命名会话标题（历史列表里的需求标题目前不支持编辑，补这个接口）。 */
    @PutMapping("/sessions/{id}/title")
    public PrdSessionView updateTitle(@PathVariable String id, @Valid @RequestBody UpdateTitleRequest req) {
        repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "会话不存在: " + id));
        repo.updateTitle(id, req.title().trim());
        return repo.findById(id).map(PrdSessionView::from)
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

    /**
     * 取消关联 Vibe Coding 开发会话（{@link #linkDevSession} 的反操作）——聊天窗口「关联 PRD」
     * 面板里除了「更换关联的 PRD」，也需要一个纯粹的「解除绑定」，不强制立刻选下一个。
     */
    @PostMapping("/sessions/{id}/unlink-dev-session")
    public ReqItemLinkResult unlinkDevSession(@PathVariable String id) {
        repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "会话不存在: " + id));
        repo.updateDevSessionId(id, null);
        return new ReqItemLinkResult(true);
    }

    record ReqItemLinkResult(boolean ok) {}

    /**
     * 按 Vibe Coding 开发会话 ID 反查关联的 PRD 会话（{@link #linkDevSession} 的反向查询）——
     * claude-chat 聊天窗口用它判断"当前会话是否已绑定 PRD"、在窗口里显示标识。未绑定是正常
     * 状态（大多数会话都没绑），返回 404，前端据此区分"没绑定"和真正的接口异常。
     */
    @GetMapping("/sessions/by-dev-session/{devSessionId}")
    public PrdSessionView getByDevSession(@PathVariable String devSessionId) {
        return repo.findByDevSessionId(devSessionId)
                .map(PrdSessionView::from)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "未找到关联的 PRD 会话"));
    }

    /**
     * {@link #getByDevSession} 的批量版本——claude-chat 会话列表要在每一行标出"是否绑定 PRD"，
     * 逐行调用单条接口是 N+1 请求，这里一次性按 ids 查完。未绑定的 devSessionId 不会出现在
     * 返回的 Map 里，前端按 key 是否存在判断，不用像单条接口那样处理 404。
     */
    @GetMapping("/sessions/by-dev-sessions")
    public Map<String, PrdSessionView> getByDevSessions(@org.springframework.web.bind.annotation.RequestParam List<String> ids) {
        if (ids == null || ids.isEmpty()) return Map.of();
        Map<String, PrdSessionView> result = new java.util.LinkedHashMap<>();
        for (PrdSession s : repo.findByDevSessionIds(ids)) {
            if (s.getDevSessionId() != null && !s.getDevSessionId().isBlank()) {
                result.put(s.getDevSessionId(), PrdSessionView.from(s));
            }
        }
        return result;
    }

    /**
     * SSE 流式：生成/更新技术开发方案文档。事件：chunk / done / error（与 PRD 生成接口一致）。
     *
     * <p>请求体可选携带：extraInstructions——前端「生成开发文档」弹框里用户补充的自定义提示词/
     * 更新说明；updateExisting=true 时基于当前已有开发文档做增量更新（覆盖前自动备份旧版本为
     * {id}-dev-v{n}.md），而不是从 PRD 从零生成。不再点了就直接触发，先弹框确认。</p>
     */
    @PostMapping(value = "/sessions/{id}/dev-doc", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter generateDevDoc(@PathVariable String id,
                                      @RequestBody(required = false) GenerateDevDocRequest req) {
        SseEmitter emitter = new SseEmitter(0L);
        service.generateDevDoc(id,
                req == null ? null : req.extraInstructions(),
                req == null ? null : req.updateExisting(),
                req == null ? null : req.qaHistory(),
                emitter);
        return emitter;
    }

    /**
     * 开发文档更新前的多轮渐进澄清：请求 Claude 就"这次更新说明相对当前开发文档还有哪里不明确"
     * 提出下一个问题。用法/事件与 {@code /sessions/{id}/ask}（PRD 澄清）一致。
     */
    @PostMapping(value = "/sessions/{id}/dev-doc/ask", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter askNextDevDocQuestion(@PathVariable String id,
                                             @RequestBody AskNextDevDocQuestionRequest req) {
        SseEmitter emitter = new SseEmitter(0L);
        service.askNextDevDocQuestion(id, req.questionIndex(), req.history(), req.updateNotes(), emitter);
        return emitter;
    }

    /** 读取开发文档内容（JSON 字符串格式，与 /content 保持一致）。 */
    @GetMapping(value = "/sessions/{id}/dev-doc", produces = MediaType.APPLICATION_JSON_VALUE)
    public String getDevDocContent(@PathVariable String id) throws IOException {
        return service.readDevDocContent(id);
    }

    /**
     * 列出该会话开发文档的所有版本摘要（以磁盘上实际存在的备份文件为准，见
     * {@link DevDocVersionSummary} 类注释）。供「生成记录」抽屉展示版本列表。
     */
    @GetMapping("/sessions/{id}/dev-doc/versions")
    public List<DevDocVersionSummary> listDevDocVersions(@PathVariable String id) {
        return service.listDevDocVersions(id);
    }

    /**
     * 读取开发文档某个历史版本的内容（JSON 字符串格式）。version 对应 {@link #listDevDocVersions}
     * 返回的版本号；若是当前版本直接读当前文件，否则读磁盘上备份的 {id}-dev-v{version}.md。
     */
    @GetMapping(value = "/sessions/{id}/dev-doc/versions/{version}", produces = MediaType.APPLICATION_JSON_VALUE)
    public String getDevDocVersionContent(@PathVariable String id, @PathVariable int version) throws IOException {
        return service.readDevDocVersionContent(id, version);
    }

    /** 保存用户编辑后的开发文档。 */
    @PutMapping("/sessions/{id}/dev-doc")
    public ResponseEntity<Void> saveDevDocContent(@PathVariable String id,
                                                   @Valid @RequestBody SaveContentRequest req) throws IOException {
        service.saveDevDocContent(id, req.content());
        return ResponseEntity.ok().build();
    }

    /**
     * AI 工时评估：基于当前 PRD + 当前开发文档（结合代码/业务知识图谱查询结果）评估开发工时。
     * 同步阻塞调一次 oneShot LLM（用法与 {@code createSession} 里的需求类型自动判定一致），
     * 结果落库后随会话详情一起返回，历史列表/开发文档 Tab 都从这里读。
     */
    @PostMapping("/sessions/{id}/dev-doc/estimate")
    public PrdSessionView estimateEffort(@PathVariable String id,
                                          @RequestBody(required = false) EstimateEffortRequest req) {
        com.exceptioncoder.toolbox.prdclarify.domain.PrdSession updated =
                service.estimateDevDocEffort(id, req == null ? null : req.extraContext());
        return PrdSessionView.from(updated);
    }

    /** 测试用：获取 PRD 文件路径（方便定位文件）。 */
    @GetMapping("/sessions/{id}/path")
    public Map<String, String> getPath(@PathVariable String id) {
        return repo.findById(id)
                .map(s -> Map.of("mdPath", s.getMdPath() != null ? s.getMdPath() : ""))
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "会话不存在: " + id));
    }
}
