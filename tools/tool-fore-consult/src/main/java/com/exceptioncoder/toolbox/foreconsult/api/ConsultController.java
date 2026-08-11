package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.foreconsult.api.dto.ArchiveRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.ClassifyQuestionRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.ConsultAttachmentView;
import com.exceptioncoder.toolbox.foreconsult.api.dto.ConsultSessionView;
import com.exceptioncoder.toolbox.foreconsult.api.dto.ConsultDispatchView;
import com.exceptioncoder.toolbox.foreconsult.api.dto.ConsultTurnView;
import com.exceptioncoder.toolbox.foreconsult.api.dto.DispatchConsultRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.FeedbackRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.FeedbackView;
import com.exceptioncoder.toolbox.foreconsult.api.dto.LinkDevSessionRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.QuestionClassificationView;
import com.exceptioncoder.toolbox.foreconsult.api.dto.RenameQuestionTitleRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.StartSessionRequest;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultAttachmentService;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultDispatchService;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultService;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultQuestionClassifier;
import com.exceptioncoder.toolbox.foreconsult.service.CodexHomeDiscoveryService;
import com.exceptioncoder.toolbox.foreconsult.service.TurnBugExtractionService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Fore- 业务系统咨询工具 REST 端点。路径前缀 {@code /api/fore-consult}。
 * 回答由复用的 claude-chat 悬浮会话完成，本控制器只负责会话归档与查询。
 *
 * <ul>
 *   <li>{@code POST   /sessions}                        — 启动咨询会话（PENDING）</li>
 *   <li>{@code GET    /sessions}                        — 最近 50 条历史</li>
 *   <li>{@code GET    /sessions/{id}}                   — 会话详情（含轮次）</li>
 *   <li>{@code POST   /sessions/{id}/link-dev-session}  — 回写关联的 claude-chat 会话 id</li>
 *   <li>{@code POST   /sessions/{id}/archive}           — 结束并归档（提交全部轮次）</li>
 *   <li>{@code DELETE /sessions/{id}}                   — 删除会话 + 轮次</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/fore-consult")
@RequireAuth
public class ConsultController {

    private final ConsultService service;
    private final ConsultAttachmentService attachmentService;
    private final TurnBugExtractionService bugExtractionService;
    private final ConsultQuestionClassifier questionClassifier;
    private final ConsultDispatchService dispatchService;
    private final CodexHomeDiscoveryService codexHomeDiscoveryService;

    public ConsultController(ConsultService service, ConsultAttachmentService attachmentService,
                             TurnBugExtractionService bugExtractionService,
                             ConsultQuestionClassifier questionClassifier,
                             ConsultDispatchService dispatchService,
                             CodexHomeDiscoveryService codexHomeDiscoveryService) {
        this.service = service;
        this.attachmentService = attachmentService;
        this.bugExtractionService = bugExtractionService;
        this.questionClassifier = questionClassifier;
        this.dispatchService = dispatchService;
        this.codexHomeDiscoveryService = codexHomeDiscoveryService;
    }

    /** Lists Codex authorization directories directly below the runtime user's home directory. */
    @GetMapping("/codex-homes")
    public List<String> listCodexHomes() {
        return codexHomeDiscoveryService.list();
    }

    /** 上传咨询附件（图片/Excel/Word/Markdown/PDF 等）。落盘到系统 cwd 或用户目录，返回绝对路径。 */
    @PostMapping("/attachments")
    public ConsultAttachmentView uploadAttachment(@RequestParam(value = "cwd", required = false) String cwd,
                                                  @RequestPart("file") MultipartFile file) throws IOException {
        return attachmentService.store(cwd, file);
    }

    /** 启动咨询会话。 */
    @PostMapping("/sessions")
    public ConsultSessionView start(@Valid @RequestBody StartSessionRequest req) {
        var initial = dispatchService.initial(req);
        return ConsultSessionView.from(service.startSession(
                req, initial.orchestration().prompt(), initial.evidenceRoute()));
    }

    /** Classify and enrich a follow-up with the same server-owned orchestration pipeline. */
    @PostMapping("/sessions/{id}/dispatch")
    public ConsultDispatchView dispatch(@PathVariable String id,
                                        @Valid @RequestBody DispatchConsultRequest req) {
        return dispatchService.followUp(service.get(id), req);
    }

    /** 历史列表（最近 50 条，按创建时间倒序）。 */
    @GetMapping("/sessions")
    public List<ConsultSessionView> list() {
        var sessions = service.listRecent(50);
        Map<String, Integer> turnCounts = service.turnCounts(
                sessions.stream().map(session -> session.getSessionId()).toList());
        Map<String, String> creatorNames = service.creatorNames(
                sessions.stream().map(session -> session.getUserId()).toList());
        return sessions.stream()
                .map(session -> ConsultSessionView.summary(
                        session, creatorNames.get(session.getUserId()), turnCounts.getOrDefault(session.getSessionId(), 0)))
                .toList();
    }

    /** 会话详情（含轮次明细 + 评分反馈）。 */
    @GetMapping("/sessions/{id}")
    public ConsultSessionView get(@PathVariable String id) {
        return ConsultSessionView.from(service.get(id), turnViewsOf(id), feedbackViewsOf(id));
    }

    /** 重命名历史咨询的问题标题。 */
    @PatchMapping("/sessions/{id}/question-title")
    public ConsultSessionView renameQuestionTitle(@PathVariable String id,
                                                  @Valid @RequestBody RenameQuestionTitleRequest req) {
        return ConsultSessionView.from(service.renameQuestionTitle(id, req.title()));
    }

    /** 回写关联的 claude-chat 会话 id（拉起悬浮会话后由前端调用）。 */
    @PostMapping("/sessions/{id}/link-dev-session")
    public ConsultSessionView linkDevSession(@PathVariable String id,
                                             @Valid @RequestBody LinkDevSessionRequest req) {
        return ConsultSessionView.from(service.linkDevSession(id, req.devSessionId().trim()));
    }

    /** 结束咨询并归档（一次性提交本次会话全部轮次；归档内部容错，失败会话状态置 FAILED）。 */
    @PostMapping("/sessions/{id}/archive")
    public ConsultSessionView archive(@PathVariable String id, @RequestBody ArchiveRequest req) {
        var session = service.archive(id, req);
        bugExtractionService.extractSessionAsync(id, session.getModel());
        return ConsultSessionView.from(session, turnViewsOf(id), feedbackViewsOf(id));
    }

    /** 进行中增量同步：把当前对话落库但保持 PENDING，供同一用户在其它电脑或管理员查看。 */
    @PostMapping("/sessions/{id}/turns")
    public ConsultSessionView syncTurns(@PathVariable String id, @RequestBody ArchiveRequest req) {
        var session = service.syncTurns(id, req);
        bugExtractionService.extractSessionAsync(id, session.getModel());
        return ConsultSessionView.from(session, turnViewsOf(id), feedbackViewsOf(id));
    }

    @PostMapping("/sessions/{id}/classify-question")
    public QuestionClassificationView classifyQuestion(
            @PathVariable String id,
            @Valid @RequestBody ClassifyQuestionRequest req) {
        service.get(id);
        return questionClassifier.classify(id, req);
    }

    /**
     * 对该会话已落库的轮次跑后端 BUG 抽取，命中即登记。
     *
     * <p>目前是手动触发：前端仍在用「回答里夹带机器可读块 + 前端登记」的老路径，
     * 两边同时自动跑会把同一缺陷登记两遍（虽有 dedup_key 兜底成累加，语义上仍是错的）。
     * 待前端摘掉解析与登记后，再把本调用挂到轮次落库钩子上转为自动。
     *
     * @param force 忽略答案指纹强制重抽，换了提示词版本后重跑用
     */
    @PostMapping("/sessions/{id}/extract-bugs")
    public TurnBugExtractionService.Summary extractBugs(
            @PathVariable String id,
            @RequestParam(required = false) String model,
            @RequestParam(defaultValue = "false") boolean force) {
        service.get(id);
        return bugExtractionService.extractSession(id, model, force);
    }

    /** 某轮回答的评分/反馈（GOOD 一键；BAD 携带类型/原因/正确答案）。 */
    @PostMapping("/sessions/{id}/turns/{turnIndex}/feedback")
    public FeedbackView feedback(@PathVariable String id, @PathVariable int turnIndex,
                                 @Valid @RequestBody FeedbackRequest req) {
        return FeedbackView.from(service.saveFeedback(id, turnIndex, req));
    }

    /** 删除会话（含轮次与反馈）。 */
    @DeleteMapping("/sessions/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    /** 某会话的轮次视图列表（get / archive / sync 复用）。 */
    private List<ConsultTurnView> turnViewsOf(String id) {
        return service.turnsOf(id).stream()
                .map(ConsultTurnView::from)
                .toList();
    }

    /** 某会话的反馈视图列表。 */
    private List<FeedbackView> feedbackViewsOf(String id) {
        return service.feedbackOf(id).stream()
                .map(FeedbackView::from)
                .toList();
    }
}
