package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.foreconsult.api.dto.ArchiveRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.ConsultAttachmentView;
import com.exceptioncoder.toolbox.foreconsult.api.dto.ConsultSessionView;
import com.exceptioncoder.toolbox.foreconsult.api.dto.ConsultTurnView;
import com.exceptioncoder.toolbox.foreconsult.api.dto.LinkDevSessionRequest;
import com.exceptioncoder.toolbox.foreconsult.api.dto.StartSessionRequest;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultAttachmentService;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultService;
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

    public ConsultController(ConsultService service, ConsultAttachmentService attachmentService) {
        this.service = service;
        this.attachmentService = attachmentService;
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

    /** 会话详情（含轮次明细）。 */
    @GetMapping("/sessions/{id}")
    public ConsultSessionView get(@PathVariable String id) {
        return ConsultSessionView.from(service.get(id), turnViewsOf(id));
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
        return ConsultSessionView.from(service.archive(id, req), turnViewsOf(id));
    }

    /** 删除会话（含轮次）。 */
    @DeleteMapping("/sessions/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    /** 某会话的轮次视图列表（get / archive 复用）。 */
    private List<ConsultTurnView> turnViewsOf(String id) {
        return service.turnsOf(id).stream()
                .map(ConsultTurnView::from)
                .toList();
    }
}
