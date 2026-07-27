package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.foreconsult.api.dto.ArchiveRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.ConsultAttachmentView;
import com.exceptioncoder.toolbox.foreconsult.api.dto.ConsultSessionView;
import com.exceptioncoder.toolbox.foreconsult.api.dto.ConsultTurnView;
import com.exceptioncoder.toolbox.foreconsult.api.dto.FeedbackRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.FeedbackView;
import com.exceptioncoder.toolbox.foreconsult.api.dto.LinkDevSessionRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.StartSessionRequest;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultAttachmentService;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultService;
import com.exceptioncoder.toolbox.foreconsult.service.TurnBugExtractionService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

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
public class ConsultController {

    private final ConsultService service;
    private final ConsultAttachmentService attachmentService;
    private final TurnBugExtractionService bugExtractionService;

    public ConsultController(ConsultService service, ConsultAttachmentService attachmentService,
                             TurnBugExtractionService bugExtractionService) {
        this.service = service;
        this.attachmentService = attachmentService;
        this.bugExtractionService = bugExtractionService;
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
        return ConsultSessionView.from(service.startSession(req));
    }

    /** 历史列表（最近 50 条，按创建时间倒序）。 */
    @GetMapping("/sessions")
    public List<ConsultSessionView> list() {
        return service.listRecent(50).stream()
                .map(ConsultSessionView::from)
                .toList();
    }

    /** 会话详情（含轮次明细 + 评分反馈）。 */
    @GetMapping("/sessions/{id}")
    public ConsultSessionView get(@PathVariable String id) {
        return ConsultSessionView.from(service.get(id), turnViewsOf(id), feedbackViewsOf(id));
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
        return ConsultSessionView.from(service.archive(id, req), turnViewsOf(id), feedbackViewsOf(id));
    }

    /** 进行中增量同步：把当前对话落库但保持 PENDING，供其它电脑从库查看进行中的内容。 */
    @PostMapping("/sessions/{id}/turns")
    public ConsultSessionView syncTurns(@PathVariable String id, @RequestBody ArchiveRequest req) {
        return ConsultSessionView.from(service.syncTurns(id, req), turnViewsOf(id), feedbackViewsOf(id));
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
