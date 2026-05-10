package com.exceptioncoder.toolbox.mail.api;

import com.exceptioncoder.toolbox.mail.api.dto.MailBatchResultView;
import com.exceptioncoder.toolbox.mail.api.dto.MailDetailView;
import com.exceptioncoder.toolbox.mail.api.dto.MailIdBatchRequest;
import com.exceptioncoder.toolbox.mail.api.dto.MailListItemView;
import com.exceptioncoder.toolbox.mail.api.dto.MailListResponse;
import com.exceptioncoder.toolbox.mail.api.dto.MailServerStatusView;
import com.exceptioncoder.toolbox.mail.api.dto.MailStatsView;
import com.exceptioncoder.toolbox.mail.config.SmtpServerManager;
import com.exceptioncoder.toolbox.mail.domain.MailInbox;
import com.exceptioncoder.toolbox.mail.repository.MailInboxRepository;
import com.exceptioncoder.toolbox.mail.repository.MailInboxRepository.MailInboxFilter;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

/** 收件箱 REST API，base path {@code /api/mail}。 */
@RestController
@RequestMapping("/api/mail")
public class MailController {

    private static final int MAX_PAGE_SIZE = 100;
    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_BATCH_IDS = 500;

    private final MailInboxRepository repo;
    private final SmtpServerManager smtpManager;

    public MailController(MailInboxRepository repo, SmtpServerManager smtpManager) {
        this.repo = repo;
        this.smtpManager = smtpManager;
    }

    /** 收件箱分页列表，按接收时间倒序。 */
    @GetMapping("/inbox")
    public MailListResponse listInbox(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "" + DEFAULT_PAGE_SIZE) int size,
            @RequestParam(required = false) String toAddress,
            @RequestParam(required = false) Boolean isRead,
            @RequestParam(required = false) String keyword) {

        int safeSize = Math.min(size, MAX_PAGE_SIZE);
        MailInboxFilter filter = new MailInboxFilter(toAddress, isRead, keyword);

        List<MailListItemView> items = repo.findPage(filter, page, safeSize)
                .stream().map(MailListItemView::from).toList();
        long total = repo.countTotal(filter);
        long unreadCount = repo.countUnread(filter);

        return new MailListResponse(items, total, page, safeSize, unreadCount);
    }

    /** 获取邮件详情，同时将该邮件标记为已读。 */
    @GetMapping("/inbox/{id}")
    public ResponseEntity<MailDetailView> getDetail(@PathVariable String id) {
        Optional<MailInbox> opt = repo.findById(id);
        if (opt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        repo.markRead(id);
        MailInbox mail = opt.get();
        mail.setRead(true);
        return ResponseEntity.ok(MailDetailView.from(mail));
    }

    /** 手动标记单封邮件为已读：成功返回 204，记录不存在返回 404。 */
    @PatchMapping("/inbox/{id}/read")
    public ResponseEntity<Void> markRead(@PathVariable String id) {
        return repo.markRead(id) ? ResponseEntity.noContent().build()
                                 : ResponseEntity.notFound().build();
    }

    /** 物理删除单封邮件：成功返回 204，记录不存在返回 404。 */
    @DeleteMapping("/inbox/{id}")
    public ResponseEntity<Void> deleteById(@PathVariable String id) {
        return repo.deleteById(id) ? ResponseEntity.noContent().build()
                                   : ResponseEntity.notFound().build();
    }

    /** 批量标记已读，body: {@code {"ids":["a","b"]}}，返回 {@code {"affected":N}}。 */
    @PatchMapping("/inbox/batch/read")
    public ResponseEntity<MailBatchResultView> markReadBatch(@RequestBody MailIdBatchRequest body) {
        List<String> ids = sanitizeIds(body);
        if (ids == null) return ResponseEntity.badRequest().build();
        return ResponseEntity.ok(new MailBatchResultView(repo.markReadBatch(ids)));
    }

    /** 批量物理删除，body: {@code {"ids":["a","b"]}}，返回 {@code {"affected":N}}。 */
    @PostMapping("/inbox/batch/delete")
    public ResponseEntity<MailBatchResultView> deleteBatch(@RequestBody MailIdBatchRequest body) {
        List<String> ids = sanitizeIds(body);
        if (ids == null) return ResponseEntity.badRequest().build();
        return ResponseEntity.ok(new MailBatchResultView(repo.deleteByIdsBatch(ids)));
    }

    /** 收件箱整体统计（未读数、总数）。 */
    @GetMapping("/stats")
    public MailStatsView getStats() {
        MailInboxFilter all = new MailInboxFilter(null, null, null);
        return new MailStatsView(repo.countTotal(all), repo.countUnread(all));
    }

    /** SMTP 内嵌服务器运行状态，供前端在 WebUI 上呈现服务健康度。 */
    @GetMapping("/server/status")
    public MailServerStatusView getServerStatus() {
        SmtpServerManager.Status s = smtpManager.status();
        return new MailServerStatusView(s.enabled(), s.running(), s.port(), s.hostname(), s.error());
    }

    /** 校验批量 ID 列表：null/空/超限返回 null 让上层 400。 */
    private List<String> sanitizeIds(MailIdBatchRequest body) {
        if (body == null || body.ids() == null || body.ids().isEmpty()) return null;
        if (body.ids().size() > MAX_BATCH_IDS) return null;
        return body.ids().stream().filter(s -> s != null && !s.isBlank()).toList();
    }
}
