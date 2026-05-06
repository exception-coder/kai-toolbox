package com.exceptioncoder.toolbox.mail.api;

import com.exceptioncoder.toolbox.mail.api.dto.MailDetailView;
import com.exceptioncoder.toolbox.mail.api.dto.MailListItemView;
import com.exceptioncoder.toolbox.mail.api.dto.MailListResponse;
import com.exceptioncoder.toolbox.mail.api.dto.MailStatsView;
import com.exceptioncoder.toolbox.mail.domain.MailInbox;
import com.exceptioncoder.toolbox.mail.repository.MailInboxRepository;
import com.exceptioncoder.toolbox.mail.repository.MailInboxRepository.MailInboxFilter;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/** 收件箱 REST API，base path {@code /api/mail}。 */
@RestController
@RequestMapping("/api/mail")
public class MailController {

    private static final int MAX_PAGE_SIZE = 100;
    private static final int DEFAULT_PAGE_SIZE = 20;

    private final MailInboxRepository repo;

    public MailController(MailInboxRepository repo) {
        this.repo = repo;
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

    /** 手动标记指定邮件为已读。 */
    @PatchMapping("/inbox/{id}/read")
    public ResponseEntity<Map<String, Boolean>> markRead(@PathVariable String id) {
        Optional<MailInbox> opt = repo.findById(id);
        if (opt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        repo.markRead(id);
        return ResponseEntity.ok(Map.of("success", true));
    }

    /** 物理删除邮件，不可恢复。 */
    @DeleteMapping("/inbox/{id}")
    public ResponseEntity<Map<String, Boolean>> deleteById(@PathVariable String id) {
        Optional<MailInbox> opt = repo.findById(id);
        if (opt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        repo.deleteById(id);
        return ResponseEntity.ok(Map.of("success", true));
    }

    /** 收件箱整体统计（未读数、总数）。 */
    @GetMapping("/stats")
    public MailStatsView getStats() {
        MailInboxFilter all = new MailInboxFilter(null, null, null);
        return new MailStatsView(repo.countTotal(all), repo.countUnread(all));
    }
}
