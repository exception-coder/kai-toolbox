package com.exceptioncoder.toolbox.prdclarify.api;

import com.exceptioncoder.toolbox.prdclarify.api.dto.AdoptSplitRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.AskNextDevDocQuestionRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.AskNextQuestionRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.AttachmentParseView;
import com.exceptioncoder.toolbox.prdclarify.api.dto.CandidateDecisionRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.CandidateChangeCauseRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.BackgroundDocUpdateRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.CandidateReanalyzeRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.CandidateStageRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.CreateSessionRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.DevDocVersionSummary;
import com.exceptioncoder.toolbox.prdclarify.api.dto.DistributeAnswerRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.EstimateEffortRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.EvaluateProgressRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.GenerateDevDocRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.GenerateDevDocQuestionsRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.GeneratePrdRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.ImageAttachmentView;
import com.exceptioncoder.toolbox.prdclarify.api.dto.ProgressVersionSummary;
import com.exceptioncoder.toolbox.prdclarify.api.dto.PrdDocChangeCandidateView;
import com.exceptioncoder.toolbox.prdclarify.service.AttachmentParseService;
import com.exceptioncoder.toolbox.prdclarify.service.FileAttachmentStorageService;
import com.exceptioncoder.toolbox.prdclarify.service.ImageAttachmentStorageService;
import com.exceptioncoder.toolbox.prdclarify.api.dto.PrdSessionView;
import com.exceptioncoder.toolbox.prdclarify.api.dto.SaveContentRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.SaveDraftRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.SplitItemView;
import com.exceptioncoder.toolbox.prdclarify.api.dto.SplitPreviewView;
import com.exceptioncoder.toolbox.prdclarify.api.dto.SaveQaHistoryRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.SubmitAnswersRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.SuggestTitleRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.SuggestTitleView;
import com.exceptioncoder.toolbox.prdclarify.api.dto.UpdateTitleRequest;
import com.exceptioncoder.toolbox.prdclarify.api.dto.UpdateProjectRequest;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.exceptioncoder.toolbox.prdclarify.service.PrdClarifyService;
import com.exceptioncoder.toolbox.prdclarify.service.PrdDocChangeAnalysisService;
import com.exceptioncoder.toolbox.prdclarify.service.PrdDocChangeApplyService;
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
 *   <li>{@code POST   /sessions/draft}            — 保存草稿（仅标题/项目/模块/需求描述）</li>
 *   <li>{@code PUT    /sessions/{id}/draft}       — 再次保存草稿</li>
 *   <li>{@code POST   /sessions/{id}/start-from-draft} — 草稿转正式，发起澄清</li>
 *   <li>{@code POST   /sessions/{id}/split}        — AI 需求拆分预览（不落库）</li>
 *   <li>{@code POST   /sessions/{id}/split/adopt}  — 采纳拆分结果，批量生成子需求草稿</li>
 *   <li>{@code GET    /sessions}                  — 最近 50 条历史</li>
 *   <li>{@code GET    /sessions/{id}}             — 获取会话详情</li>
 *   <li>{@code PUT    /sessions/{id}/title}       — 重命名会话标题</li>
 *   <li>{@code DELETE /sessions/{id}}             — 删除会话 + 文件</li>
 *   <li>{@code POST   /sessions/{id}/clarify}     — SSE：生成澄清问题</li>
 *   <li>{@code POST   /sessions/{id}/answers}     — 提交用户答案</li>
 *   <li>{@code POST   /sessions/{id}/generate}    — SSE：生成/更新 PRD 文档（updateExisting=true 走增量更新）</li>
 *   <li>{@code GET    /sessions/{id}/content}     — 读取 .md 文件</li>
 *   <li>{@code PUT    /sessions/{id}/content}     — 保存编辑后的 .md 文件</li>
 *   <li>{@code POST   /sessions/{id}/dev-doc/estimate} — AI 工时评估</li>
 *   <li>{@code POST   /sessions/{id}/link-dev-session} — 关联 Vibe Coding 开发会话</li>
 *   <li>{@code POST   /sessions/{id}/unlink-dev-session} — 取消关联 Vibe Coding 开发会话</li>
 *   <li>{@code GET    /sessions/by-dev-session/{devSessionId}} — 按开发会话反查关联 PRD</li>
 *   <li>{@code GET    /sessions/by-dev-sessions?ids=...}   — 批量反查关联 PRD</li>
 *   <li>{@code POST   /attachments/image}         — 粘贴图片落盘</li>
 *   <li>{@code GET    /attachments/image/{id}}    — 取回图片</li>
 *   <li>{@code GET    /attachments/file/{id}}     — 下载原始需求附件（Word/PDF/Markdown 原文件）</li>
 *   <li>{@code POST   /sessions/{id}/progress/evaluate} — SSE：AI 进度评估</li>
 *   <li>{@code GET    /sessions/{id}/progress/versions} — 进度评估版本列表</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/prd-clarify")
public class PrdClarifyController {

    private final PrdClarifyService service;
    private final PrdSessionRepository repo;
    private final AttachmentParseService attachmentParser;
    private final ImageAttachmentStorageService imageAttachmentStorage;
    private final FileAttachmentStorageService fileAttachmentStorage;
    private final PrdDocChangeAnalysisService changeAnalysisService;
    private final PrdDocChangeApplyService changeApplyService;
    /** Optional：toolbox.auth.enabled=false 时这个 bean 不存在，历史列表退化为不展示创建人用户名。 */
    private final Optional<AuthUserRepository> authUserRepo;

    public PrdClarifyController(PrdClarifyService service, PrdSessionRepository repo,
                                AttachmentParseService attachmentParser,
                                ImageAttachmentStorageService imageAttachmentStorage,
                                FileAttachmentStorageService fileAttachmentStorage,
                                PrdDocChangeAnalysisService changeAnalysisService,
                                PrdDocChangeApplyService changeApplyService,
                                Optional<AuthUserRepository> authUserRepo) {
        this.service = service;
        this.repo = repo;
        this.attachmentParser = attachmentParser;
        this.imageAttachmentStorage = imageAttachmentStorage;
        this.fileAttachmentStorage = fileAttachmentStorage;
        this.changeAnalysisService = changeAnalysisService;
        this.changeApplyService = changeApplyService;
        this.authUserRepo = authUserRepo;
    }

    /**
     * 附件文本提取 + 原文件落盘：上传 Markdown / PDF / Word 文件，一次性做两件事——
     * ①提取文本供前端拼进 rawInput 喂给 AI；②原始文件也落盘（见
     * {@link FileAttachmentStorageService}），返回下载链接，前端把
     * {@code [📎 附件：filename](url)} 一并插进 rawInput，避免像之前那样解析完文本原文件就
     * 丢了、用户回看 PRD 时找不到当初提需求的 Word/PDF 原件。
     * 支持格式：.md / .txt / .pdf / .docx / .doc，单文件解析上限 20000 字符、落盘上限 30MB。
     */
    @PostMapping(value = "/attachments/parse", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<AttachmentParseView> parseAttachment(
            @org.springframework.web.bind.annotation.RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        if (file.isEmpty()) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "文件不能为空");
        }
        if (!attachmentParser.isSupported(file)) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,
                    "不支持的文件格式，请上传 .md / .pdf / .docx 文件");
        }
        try {
            AttachmentParseService.ParseResult parsed = attachmentParser.parse(file);
            FileAttachmentStorageService.StoredFile stored = fileAttachmentStorage.store(file);
            return ResponseEntity.ok(new AttachmentParseView(
                    parsed.fileName(), parsed.contentType(), parsed.text(), parsed.truncated(),
                    stored.id(), stored.url()));
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

    /** 下载原始需求附件（parseAttachment 落盘的 Word/PDF/Markdown 原文件）。 */
    @GetMapping("/attachments/file/{id}")
    public ResponseEntity<org.springframework.core.io.Resource> downloadFile(@PathVariable String id) {
        FileAttachmentStorageService.DownloadFile f = fileAttachmentStorage.locate(id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(f.mime()))
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + f.name() + "\"")
                .body(new org.springframework.core.io.FileSystemResource(f.path()));
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
                req.title(), req.rawInput(), req.project(), req.module(), req.model(), req.engine(), req.role(),
                req.reqType(), req.maxQuestions(), createdByUserId, req.clarifyMode(), req.businessFields(),
                req.parentId());
        return PrdSessionView.from(session);
    }

    /** 根据系统、模块、需求描述和粘贴图片生成规范 PRD 标题。 */
    @PostMapping("/title-suggestion")
    public SuggestTitleView suggestTitle(@Valid @RequestBody SuggestTitleRequest req) {
        PrdClarifyService.TitleSuggestion suggestion =
                service.suggestTitle(req.project(), req.module(), req.rawInput());
        return new SuggestTitleView(suggestion.shortTitle(), suggestion.title());
    }

    /**
     * 保存草稿：只含标题/需求描述/关联项目模块，不判定需求类型/澄清深度/模式（那些要等真正
     * 点「开始澄清」才决定）。用于「填了个开头但还没想好要不要马上澄清」的场景，避免半成品
     * 内容因为关掉标签页就丢失——之前 InputPanel 表单只是纯 React state，没有任何持久化路径。
     */
    @PostMapping("/sessions/draft")
    public PrdSessionView saveDraft(@Valid @RequestBody SaveDraftRequest req) {
        Long createdByUserId = AuthContext.current().map(AuthPrincipal::userId).orElse(null);
        PrdSession session = service.saveDraft(
                req.title(), req.rawInput(), req.project(), req.module(), createdByUserId, req.businessFields());
        return PrdSessionView.from(session);
    }

    /** 再次保存草稿（覆盖字段，状态保持 DRAFT）。 */
    @PutMapping("/sessions/{id}/draft")
    public PrdSessionView updateDraft(@PathVariable String id, @Valid @RequestBody SaveDraftRequest req) {
        try {
            PrdSession session = service.updateDraft(
                    id, req.title(), req.rawInput(), req.project(), req.module(), req.businessFields());
            return PrdSessionView.from(session);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(NOT_FOUND, e.getMessage());
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, e.getMessage());
        }
    }

    /**
     * 草稿转正式：原地把 DRAFT 会话切到 CLARIFYING（不新建记录），请求体跟「创建会话」同构
     * （标题/描述/项目/模块可能在恢复草稿后又被编辑过，一并带上最终值；role/reqType/maxQuestions/
     * clarifyMode 来自「开始澄清」确认弹框的选择）。
     */
    @PostMapping("/sessions/{id}/start-from-draft")
    public PrdSessionView startFromDraft(@PathVariable String id, @Valid @RequestBody CreateSessionRequest req) {
        try {
            PrdSession session = service.startClarifyFromDraft(id, req.title(), req.rawInput(), req.project(),
                    req.module(), req.model(), req.engine(), req.role(), req.reqType(), req.maxQuestions(),
                    req.clarifyMode(), req.businessFields());
            return PrdSessionView.from(session);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(NOT_FOUND, e.getMessage());
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, e.getMessage());
        }
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

    /**
     * AI 需求拆分预览：判断当前需求是否"过大"，建议拆成多个可独立澄清/开发的子需求。
     * 只读分析，不落库——前端展示可编辑的确认列表，用户确认后再调 {@link #adoptSplit}。
     */
    @PostMapping("/sessions/{id}/split")
    public SplitPreviewView split(@PathVariable String id) {
        try {
            PrdClarifyService.SplitResult result = service.splitRequirement(id);
            return new SplitPreviewView(result.canSplit(), result.reason(),
                    result.items().stream()
                            .map(it -> new SplitItemView(it.title(), it.rawInput(), it.module()))
                            .toList());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(NOT_FOUND, e.getMessage());
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY, e.getMessage());
        }
    }

    /**
     * 采纳需求拆分：把用户确认（可能编辑过）的子需求批量创建成 DRAFT 草稿，parentId 指向当前会话。
     */
    @PostMapping("/sessions/{id}/split/adopt")
    public List<PrdSessionView> adoptSplit(@PathVariable String id, @Valid @RequestBody AdoptSplitRequest req) {
        Long createdByUserId = AuthContext.current().map(AuthPrincipal::userId).orElse(null);
        try {
            List<PrdClarifyService.SplitItem> items = req.items().stream()
                    .map(it -> new PrdClarifyService.SplitItem(it.title(), it.rawInput(), it.module()))
                    .toList();
            return service.adoptSplit(id, items, createdByUserId).stream()
                    .map(PrdSessionView::from)
                    .toList();
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(NOT_FOUND, e.getMessage());
        }
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
    public SseEmitter clarify(@PathVariable String id,
                              @RequestBody(required = false) Map<String, String> req) {
        SseEmitter emitter = new SseEmitter(0L);
        if (req != null && req.get("engine") != null) {
            repo.updateEngine(id, normalizeEngine(req.get("engine")));
        }
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

    /** 修改 PRD 分组（关联项目）；根节点移动时其全部拆分/修订后代一起移动。 */
    @PutMapping("/sessions/{id}/project")
    public PrdSessionView updateProject(@PathVariable String id, @Valid @RequestBody UpdateProjectRequest req) {
        PrdSession session = repo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "会话不存在: " + id));
        if (session.getParentId() != null) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,
                    "子 PRD 不能脱离父节点单独修改分组，请修改根 PRD 分组");
        }
        String project = req.project() == null || req.project().isBlank() ? null : req.project().trim();
        repo.updateProjectTree(id, project);
        return repo.findById(id).map(PrdSessionView::from)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "会话不存在: " + id));
    }

    /** 保留当前 PRD 和问答记录，把已经生成/出错的会话恢复到需求澄清阶段。 */
    @PostMapping("/sessions/{id}/return-to-clarify")
    public PrdSessionView returnToClarify(@PathVariable String id) {
        try {
            return PrdSessionView.from(service.returnToClarify(id));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(NOT_FOUND, e.getMessage());
        }
    }

    /**
     * 批量澄清模式的「一次性回答」：把用户写成一整段的回答拆分归位到各题，返回按题序对齐的答案数组。
     *
     * <p>只返回分配结果、不落库——用户还要在前端逐题核对修改，落库交给原有的 qa-history 自动保存，
     * 避免"AI 分配完就当成用户最终答案"。
     */
    @PostMapping("/sessions/{id}/distribute-answer")
    public PrdClarifyService.AnswerDistribution distributeAnswer(
            @PathVariable String id,
            @Valid @RequestBody DistributeAnswerRequest req) {
        return service.distributeBatchAnswer(id, req.rawAnswer());
    }

    /** 提交用户对澄清问题的回答。 */
    @PostMapping("/sessions/{id}/answers")
    public PrdSessionView submitAnswers(@PathVariable String id,
                                        @Valid @RequestBody SubmitAnswersRequest req) {
        PrdSession updated = service.submitAnswers(id, req.answers());
        return PrdSessionView.from(updated);
    }

    /**
     * SSE 流式：调 Claude 生成/更新 PRD Markdown 文档。
     * 事件：chunk（content 增量）、done（完成）、error（失败）。
     * req 缺省或 updateExisting!=true：原有行为，从原始需求描述+澄清问答从零生成/覆盖。
     * updateExisting=true：基于当前已有 PRD 内容做增量更新，旧版本自动备份，见
     * {@link com.exceptioncoder.toolbox.prdclarify.service.PrdClarifyService#generate}。
     */
    @PostMapping(value = "/sessions/{id}/generate", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter generate(@PathVariable String id, @RequestBody(required = false) GeneratePrdRequest req) {
        SseEmitter emitter = new SseEmitter(0L);
        if (req != null && req.engine() != null) {
            repo.updateEngine(id, normalizeEngine(req.engine()));
        }
        service.generate(id, req == null ? null : req.extraInstructions(), req == null ? null : req.updateExisting(),
                req != null && Boolean.TRUE.equals(req.background()), emitter);
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
        if (req != null && req.engine() != null) {
            repo.updateEngine(id, normalizeEngine(req.engine()));
        }
        service.generateDevDoc(id,
                req == null ? null : req.extraInstructions(),
                req == null ? null : req.updateExisting(),
                req == null ? null : req.qaHistory(),
                req == null ? null : req.clarificationCompleted(),
                req == null ? null : req.background(),
                emitter);
        return emitter;
    }

    private static String normalizeEngine(String engine) {
        if (engine == null || engine.isBlank() || "claude".equalsIgnoreCase(engine)) return "claude";
        if ("codex".equalsIgnoreCase(engine)) return "codex";
        throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,
                "不支持的 Agent 引擎: " + engine);
    }

    /**
     * TDD 生成/更新前的多轮渐进澄清。initial 模式核对编码前必须明确的关键技术决策，
     * update 模式核对本次更新相对当前 TDD 的实现歧义。
     */
    @PostMapping(value = "/sessions/{id}/dev-doc/ask", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter askNextDevDocQuestion(@PathVariable String id,
                                             @RequestBody AskNextDevDocQuestionRequest req) {
        SseEmitter emitter = new SseEmitter(0L);
        if (req.engine() != null) {
            repo.updateEngine(id, normalizeEngine(req.engine()));
        }
        service.askNextDevDocQuestion(
                id, req.questionIndex(), req.history(), req.updateNotes(), req.mode(), emitter);
        return emitter;
    }

    /**
     * TDD 生成/更新前的批量技术澄清：一次返回全部关键问题，避免逐题调用模型。
     */
    @PostMapping(value = "/sessions/{id}/dev-doc/questions", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter generateDevDocQuestions(@PathVariable String id,
                                               @RequestBody GenerateDevDocQuestionsRequest req) {
        SseEmitter emitter = new SseEmitter(0L);
        if (req.engine() != null) {
            repo.updateEngine(id, normalizeEngine(req.engine()));
        }
        service.generateDevDocQuestions(id, req.updateNotes(), req.mode(), req.background(), emitter);
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

    // ─── Vibe Coding 文档变更候选 ───────────────────────

    /** 分析上次同步点之后的开发对话与 Git 变化，生成或幂等复用一条候选。 */
    @PostMapping("/sessions/{id}/change-candidates/analyze")
    public PrdDocChangeCandidateView analyzeDocumentChanges(@PathVariable String id) {
        return PrdDocChangeCandidateView.from(changeAnalysisService.analyze(id));
    }

    /** 恢复最近候选；从 PRD 面板重新打开时据此显示未完成阶段。 */
    @GetMapping("/sessions/{id}/change-candidates/latest")
    public ResponseEntity<PrdDocChangeCandidateView> latestDocumentChange(@PathVariable String id) {
        PrdDocChangeCandidateView view = PrdDocChangeCandidateView.from(changeAnalysisService.latest(id));
        return view == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(view);
    }

    /** 用户覆写 AI 建议范围，AI 原始判定保持不变。 */
    @PutMapping("/change-candidates/{candidateId}/decision")
    public PrdDocChangeCandidateView overrideDocumentChangeDecision(
            @PathVariable String candidateId,
            @RequestBody CandidateDecisionRequest request) {
        return PrdDocChangeCandidateView.from(
                changeAnalysisService.overrideDecision(candidateId, request.decision()));
    }

    @PutMapping("/change-candidates/{candidateId}/cause")
    public PrdDocChangeCandidateView confirmDocumentChangeCause(
            @PathVariable String candidateId,
            @RequestBody CandidateChangeCauseRequest request) {
        return PrdDocChangeCandidateView.from(
                changeAnalysisService.confirmChangeCause(candidateId, request.causeType(), request.detail()));
    }

    /** 立即返回 APPLYING；PRD/TDD 在后端独立执行，浏览器和反向代理断线不会取消任务。 */
    @PostMapping("/change-candidates/{candidateId}/apply-background")
    public PrdDocChangeCandidateView applyDocumentChangeInBackground(
            @PathVariable String candidateId,
            @RequestBody(required = false) BackgroundDocUpdateRequest request) {
        return PrdDocChangeCandidateView.from(changeApplyService.start(candidateId,
                request == null ? null : request.engine(),
                request == null ? null : request.extraInstructions()));
    }

    /** 回答当前唯一阻塞问题后重新分析；信息充分时不再继续追问。 */
    @PostMapping("/change-candidates/{candidateId}/reanalyze")
    public PrdDocChangeCandidateView reanalyzeDocumentChange(
            @PathVariable String candidateId,
            @RequestBody CandidateReanalyzeRequest request) {
        return PrdDocChangeCandidateView.from(
                changeAnalysisService.reanalyze(candidateId, request.answer()));
    }

    /** 记录人工确认、分阶段开始/成功/失败、暂不处理或无需更新。 */
    @PostMapping("/change-candidates/{candidateId}/stage")
    public PrdDocChangeCandidateView updateDocumentChangeStage(
            @PathVariable String candidateId,
            @RequestBody CandidateStageRequest request) {
        return PrdDocChangeCandidateView.from(
                changeAnalysisService.applyAction(candidateId, request.action(), request.error()));
    }

    // ─── 进度评估 ───────────────────────────────────────

    /**
     * SSE 流式：基于当前 PRD + 开发文档核对代码库实际实现进度，生成大纲固定的 Markdown
     * 进度评估报告。事件：chunk / done / error（与 PRD/开发文档生成接口一致）。按版本追加
     * 落盘（覆盖前自动备份旧版本为 {id}-progress-v{n}.md），不会丢历史评估快照。
     */
    @PostMapping(value = "/sessions/{id}/progress/evaluate", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter evaluateProgress(@PathVariable String id,
                                        @RequestBody(required = false) EvaluateProgressRequest req) {
        SseEmitter emitter = new SseEmitter(0L);
        service.evaluateProgress(id, req == null ? null : req.extraContext(), emitter);
        return emitter;
    }

    /** 读取当前进度评估文档内容（JSON 字符串格式，与 /content 保持一致）。 */
    @GetMapping(value = "/sessions/{id}/progress", produces = MediaType.APPLICATION_JSON_VALUE)
    public String getProgressContent(@PathVariable String id) throws IOException {
        return service.readProgressContent(id);
    }

    /**
     * 列出该会话进度评估的所有版本摘要（以磁盘上实际存在的备份文件为准，见
     * {@link ProgressVersionSummary} 类注释）。供「评估记录」抽屉展示版本列表。
     */
    @GetMapping("/sessions/{id}/progress/versions")
    public List<ProgressVersionSummary> listProgressVersions(@PathVariable String id) {
        return service.listProgressVersions(id);
    }

    /**
     * 读取进度评估某个历史版本的内容（JSON 字符串格式）。version 对应
     * {@link #listProgressVersions} 返回的版本号；若是当前版本直接读当前文件，否则读磁盘上
     * 备份的 {id}-progress-v{version}.md。
     */
    @GetMapping(value = "/sessions/{id}/progress/versions/{version}", produces = MediaType.APPLICATION_JSON_VALUE)
    public String getProgressVersionContent(@PathVariable String id, @PathVariable int version) throws IOException {
        return service.readProgressVersionContent(id, version);
    }

    /** 测试用：获取 PRD 文件路径（方便定位文件）。 */
    @GetMapping("/sessions/{id}/path")
    public Map<String, String> getPath(@PathVariable String id) {
        return repo.findById(id)
                .map(s -> Map.of("mdPath", s.getMdPath() != null ? s.getMdPath() : ""))
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "会话不存在: " + id));
    }
}
