package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.SessionHistoryService;
import com.exceptioncoder.toolbox.claudechat.service.SessionSharingService;
import com.exceptioncoder.toolbox.common.auth.repository.AuthUserRepository;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 登录态、具名、仅文字的共享入口；不接受原生句柄、目录或执行参数。 */
@RestController
@RequestMapping("/api/claude-chat")
public class SessionSharingController {
    private final SessionSharingService sharing;
    private final SessionHistoryService history;

    public SessionSharingController(SessionSharingService sharing, SessionHistoryService history) {
        this.sharing = sharing;
        this.history = history;
    }

    @ModelAttribute
    public void preventCaching(jakarta.servlet.http.HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
    }

    @GetMapping("/sessions/{id}/sharing/recipients")
    public List<AuthUserRepository.Recipient> recipients(@PathVariable String id, @RequestParam String q) {
        return sharing.recipients(id, q);
    }

    @GetMapping("/sessions/{id}/sharing")
    public List<SessionSharingService.SharedReader> readers(@PathVariable String id) {
        return sharing.readers(id);
    }

    @PutMapping("/sessions/{id}/sharing/{userId}")
    public void grant(@PathVariable String id, @PathVariable long userId) {
        sharing.grant(id, userId);
    }

    @PutMapping("/sessions/{id}/sharing/{userId}/temporary")
    public void grantTemporary(@PathVariable String id, @PathVariable long userId, @RequestParam int hours) {
        sharing.grantTemporary(id, userId, hours);
    }

    @DeleteMapping("/sessions/{id}/sharing/{userId}")
    public void revoke(@PathVariable String id, @PathVariable long userId) {
        sharing.revoke(id, userId);
    }

    @GetMapping("/shared-sessions")
    public List<SessionSharingService.SharedSession> list() {
        return sharing.sharedWithMe();
    }

    @GetMapping("/shared-sessions/{id}")
    public SessionSharingService.SharedSession view(@PathVariable String id) {
        return sharing.view(id);
    }

    @GetMapping("/shared-sessions/{id}/messages")
    public SharedMessages messages(@PathVariable String id, @RequestParam(required = false) String cursor) {
        var session = sharing.requireReader(id);
        if (session.getSdkSessionId() == null || session.getSdkSessionId().isBlank()) {
            return new SharedMessages(List.of(), null, false, null);
        }
        Integer before = null;
        if (cursor != null && cursor.startsWith("before:")) {
            try {
                before = Integer.valueOf(cursor.substring("before:".length()));
                if (before <= 0) throw new NumberFormatException();
            } catch (NumberFormatException invalid) {
                throw new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.BAD_REQUEST, "历史游标无效，请刷新会话");
            }
            cursor = null;
        }
        var page = history.readCursorMessages(session.getCwd(), session.getSdkSessionId(), session.getCodexHome(),
                before, cursor, 40);
        sharing.requireReader(id);
        var messages = page.items().stream()
                .filter(item -> "user".equals(item.kind()) || "assistant".equals(item.kind()))
                .map(item -> new SharedMessage(item.id(), item.kind(), item.text(), item.ts())).toList();
        String next = page.nextCursor();
        if (next == null && page.nextBefore() != null && page.nextBefore() > 0) {
            next = "before:" + page.nextBefore();
        }
        return new SharedMessages(messages, next, page.transcriptMissing(), page.historyGap());
    }

    public record SharedMessage(String id, String kind, String text, Long ts) {}
    public record SharedMessages(List<SharedMessage> items, String nextCursor, boolean transcriptMissing, String historyGap) {}
}
