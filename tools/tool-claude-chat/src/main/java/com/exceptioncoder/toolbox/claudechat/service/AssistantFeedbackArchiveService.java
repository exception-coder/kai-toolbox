package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.*;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.requirement.RequirementType;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;

/** 当前 Forge 用户的彩虹胶囊反馈归档应用服务。 */
@Service
public class AssistantFeedbackArchiveService {
    private static final int DEFAULT_LIMIT = 20;
    private static final int MAX_CONTENT_LENGTH = 8_000;

    private final ClaudeChatSessionRepository sessions;
    private final AssistantFeedbackStorePort feedbackStore;
    private final AttachmentStorageService attachments;

    public AssistantFeedbackArchiveService(ClaudeChatSessionRepository sessions,
                                           AssistantFeedbackStorePort feedbackStore,
                                           AttachmentStorageService attachments) {
        this.sessions = sessions;
        this.feedbackStore = feedbackStore;
        this.attachments = attachments;
    }

    public SessionPage listSessions(String sessionId, String cursor, Integer requestedLimit) {
        if (sessionId != null && !sessionId.isBlank()) return currentSession(sessionId.trim());
        long userId = userId();
        SessionCursor before = decodeSessionCursor(cursor);
        int limit = limit(requestedLimit);
        List<ClaudeChatSession> found = sessions.findConsultPage(
                userId, before == null ? null : before.lastSeenAt(), before == null ? null : before.id(), limit + 1);
        boolean hasMore = found.size() > limit;
        List<ClaudeChatSession> page = hasMore ? found.subList(0, limit) : found;
        Map<String, FeedbackCounts> counts = feedbackStore.summarizeCandidates(
                userId, page.stream().map(ClaudeChatSession::getId).toList());
        List<SessionItem> items = page.stream().map(session -> new SessionItem(
                session.getId(), session.getTitle(), session.getLastSeenAt(),
                counts.getOrDefault(session.getId(), FeedbackCounts.empty()))).toList();
        String next = hasMore && !page.isEmpty()
                ? encode(page.getLast().getLastSeenAt() + ":" + page.getLast().getId()) : null;
        return new SessionPage(items, next);
    }

    private SessionPage currentSession(String sessionId) {
        long userId = userId();
        ClaudeChatSession session = requireSession(sessionId);
        FeedbackCounts counts = feedbackStore.summarizeCandidates(userId, List.of(sessionId))
                .getOrDefault(sessionId, FeedbackCounts.empty());
        return new SessionPage(List.of(new SessionItem(
                session.getId(), session.getTitle(), session.getLastSeenAt(), counts)), null);
    }

    public CandidateResult listCandidates(String sessionId, String categoryCode,
                                          String cursor, Integer requestedLimit) {
        requireSession(sessionId);
        FeedbackCategory category = category(categoryCode);
        CandidateCursor before = decodeCandidateCursor(cursor);
        CandidatePage page = feedbackStore.listCandidates(new CandidateQuery(
                userId(), sessionId, category, before == null ? null : before.detectedAt(),
                before == null ? null : before.id(), limit(requestedLimit)));
        FeedbackCandidateView last = page.items().isEmpty() ? null : page.items().getLast();
        String next = page.hasMore() && last != null ? encode(last.detectedAt() + ":" + last.id()) : null;
        return new CandidateResult(page.items(), next);
    }

    public RevisionResult listRevisions(String sessionId, String candidateId,
                                        String cursor, Integer requestedLimit) {
        requireSession(sessionId);
        Integer before = decodeRevisionCursor(cursor);
        RevisionPage page = feedbackStore.listRevisions(new RevisionQuery(
                userId(), sessionId, candidateId, before, limit(requestedLimit)));
        FeedbackRevision last = page.items().isEmpty() ? null : page.items().getLast();
        String next = page.hasMore() && last != null ? encode(Integer.toString(last.revisionNo())) : null;
        return new RevisionResult(page.items(), next);
    }

    public FeedbackCandidateView updateCandidate(String sessionId, String candidateId, UpdateRequest request) {
        requireSession(sessionId);
        if (request == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "编辑内容不能为空");
        FeedbackCategory category = category(request.category());
        String content = request.content() == null ? "" : request.content().trim();
        if (content.isEmpty() || content.length() > MAX_CONTENT_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "反馈内容长度必须为 1-8000 个字符");
        }
        RequirementType type = RequirementType.fromCode(request.requirementType());
        if (type == RequirementType.UNKNOWN) type = defaultType(category);
        try {
            return feedbackStore.updateCandidate(new UpdateCandidateCommand(
                    userId(), sessionId, candidateId, category, type, content,
                    request.expectedUpdateTime(), System.currentTimeMillis()));
        } catch (ConcurrentFeedbackUpdateException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, exception.getMessage(), exception);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, exception.getMessage(), exception);
        }
    }

    public AttachmentStorageService.ArchivedAttachment loadAttachment(
            String sessionId, String candidateId, String attachmentId) {
        requireSession(sessionId);
        feedbackStore.findCandidateAttachment(userId(), sessionId, candidateId, attachmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "ATTACHMENT_NOT_FOUND"));
        return attachments.loadArchived(sessionId, attachmentId);
    }

    private ClaudeChatSession requireSession(String sessionId) {
        ClaudeChatSession session = sessions.findById(sessionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "会话不存在"));
        if (session.getUserId() == null || session.getUserId() != userId()
                || !"业务咨询".equals(session.getGroupName())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "当前用户不能访问该咨询归档");
        }
        return session;
    }

    private long userId() {
        return AuthContext.current().orElseThrow(() ->
                new ResponseStatusException(HttpStatus.UNAUTHORIZED, "请先登录 Forge")).userId();
    }

    private FeedbackCategory category(String code) {
        try {
            FeedbackCategory value = FeedbackCategory.valueOf(code == null ? "" : code.trim().toUpperCase());
            if (value == FeedbackCategory.NONE) throw new IllegalArgumentException();
            return value;
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "仅支持 BUG、OPTIMIZATION、REQUIREMENT");
        }
    }

    private RequirementType defaultType(FeedbackCategory category) {
        return switch (category) {
            case BUG -> RequirementType.BUG_FIX;
            case OPTIMIZATION -> RequirementType.MODULE_ADJUST;
            case REQUIREMENT -> RequirementType.NEW_MODULE;
            case NONE -> RequirementType.UNKNOWN;
        };
    }

    private int limit(Integer requested) {
        return requested == null ? DEFAULT_LIMIT : Math.max(1, Math.min(requested, 50));
    }

    private SessionCursor decodeSessionCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) return null;
        String[] values = decode(cursor).split(":", 2);
        if (values.length != 2) throw invalidCursor();
        try { return new SessionCursor(Long.parseLong(values[0]), values[1]); }
        catch (NumberFormatException exception) { throw invalidCursor(); }
    }

    private CandidateCursor decodeCandidateCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) return null;
        String[] values = decode(cursor).split(":", 2);
        if (values.length != 2) throw invalidCursor();
        try { return new CandidateCursor(Long.parseLong(values[0]), values[1]); }
        catch (NumberFormatException exception) { throw invalidCursor(); }
    }

    private Integer decodeRevisionCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) return null;
        try { return Integer.parseInt(decode(cursor)); }
        catch (NumberFormatException exception) { throw invalidCursor(); }
    }

    private String decode(String cursor) {
        try { return new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8); }
        catch (IllegalArgumentException exception) { throw invalidCursor(); }
    }

    private String encode(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private ResponseStatusException invalidCursor() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "分页游标无效");
    }

    public record SessionItem(String id, String title, long lastSeenAt, FeedbackCounts counts) { }
    public record SessionPage(List<SessionItem> items, String nextCursor) { }
    public record CandidateResult(List<FeedbackCandidateView> items, String nextCursor) { }
    public record RevisionResult(List<FeedbackRevision> items, String nextCursor) { }
    public record UpdateRequest(String category, String requirementType, String content,
                                long expectedUpdateTime) { }
    private record SessionCursor(long lastSeenAt, String id) { }
    private record CandidateCursor(long detectedAt, String id) { }
}
