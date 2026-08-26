package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatAttachment;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatAttachmentRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

/** 当前认证用户的彩虹胶囊会话历史分页用例。 */
@Service("assistantConversationHistoryService")
public class AssistantConversationHistoryService {
    private static final int DEFAULT_LIMIT = 30;
    private static final int MAX_LIMIT = 50;

    private final ClaudeChatSessionRepository sessions;
    private final SessionHistoryService history;
    private final ClaudeChatAttachmentRepository attachmentRepository;
    private final AttachmentStorageService attachmentStorage;

    public AssistantConversationHistoryService(ClaudeChatSessionRepository sessions,
                                               SessionHistoryService history,
                                               ClaudeChatAttachmentRepository attachmentRepository,
                                               AttachmentStorageService attachmentStorage) {
        this.sessions = sessions;
        this.history = history;
        this.attachmentRepository = attachmentRepository;
        this.attachmentStorage = attachmentStorage;
    }

    /**
     * 按逻辑会话 ID 读取最近或更早一页用户和助手消息。
     *
     * @param sessionId 逻辑会话 ID
     * @param before 更早消息的全局索引游标
     * @param requestedLimit 请求页大小
     * @return 可直接投影到彩虹胶囊的消息页
     */
    public ConversationPage messages(String sessionId, Integer before, Integer requestedLimit) {
        ClaudeChatSession session = requireOwnedAssistantSession(sessionId);
        if (before != null && before < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "历史消息游标不能小于 0");
        }
        int limit = requestedLimit == null ? DEFAULT_LIMIT : requestedLimit;
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "历史消息页大小必须为 1-50");
        }
        var page = history.readMessages(session.getCwd(), session.getSdkSessionId(),
                session.getCodexHome(), before, limit);
        List<String> turnIds = page.items().stream()
                .map(ChatMessageView::turnId)
                .filter(turnId -> turnId != null && !turnId.isBlank())
                .toList();
        Map<String, List<ClaudeChatAttachment>> attachmentsByTurn =
                attachmentRepository.findByTurns(sessionId, turnIds);
        List<ConversationMessage> items = page.items().stream()
                .filter(this::visibleMessage)
                .map(message -> toConversationMessage(message, attachmentsByTurn))
                .toList();
        return new ConversationPage(items, page.nextBefore(), page.transcriptMissing());
    }

    /** 校验页面会话归属后读取消息附件，文件路径不暴露给浏览器。 */
    public AttachmentStorageService.ArchivedAttachment loadAttachment(String sessionId, String attachmentId) {
        requireOwnedAssistantSession(sessionId);
        return attachmentStorage.loadArchived(sessionId, attachmentId);
    }

    private ClaudeChatSession requireOwnedAssistantSession(String sessionId) {
        ClaudeChatSession session = sessions.findById(sessionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "会话不存在"));
        long userId = AuthContext.current().orElseThrow(() ->
                new ResponseStatusException(HttpStatus.UNAUTHORIZED, "请先登录 Forge")).userId();
        boolean assistantConversation = SessionExecutionPolicy.isConsultReadonly(session.getExecutionPolicy())
                && session.getAssistantAppId() != null && session.getAssistantPageKey() != null;
        if (!assistantConversation || session.getUserId() == null || session.getUserId() != userId) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "当前用户不能访问该页面会话");
        }
        return session;
    }

    private boolean visibleMessage(ChatMessageView message) {
        return "user".equals(message.kind()) || "assistant".equals(message.kind());
    }

    private ConversationMessage toConversationMessage(
            ChatMessageView message,
            Map<String, List<ClaudeChatAttachment>> attachmentsByTurn) {
        List<ConversationAttachment> attachments = message.turnId() == null
                ? List.of()
                : attachmentsByTurn.getOrDefault(message.turnId(), List.of()).stream()
                        .map(attachment -> new ConversationAttachment(
                                attachment.id(), attachment.name(), attachment.mime(), attachment.size()))
                        .toList();
        return new ConversationMessage(message.id(), message.kind(), message.text(), message.ts(), attachments);
    }

    /** 彩虹胶囊历史消息页。 */
    public record ConversationPage(
            /** 按时间正序排列的本页消息。 */ List<ConversationMessage> items,
            /** 下一页更早消息游标；空或零表示已到顶。 */ Integer nextBefore,
            /** 原生 transcript 是否已丢失。 */ boolean transcriptMissing) { }

    /** 彩虹胶囊可见的单条用户或助手消息。 */
    public record ConversationMessage(
            /** 稳定消息 ID。 */ String id,
            /** user 或 assistant。 */ String role,
            /** 消息正文。 */ String content,
            /** 可空的消息时间戳。 */ Long timestamp,
            /** 仅用户消息可能携带的附件元数据。 */ List<ConversationAttachment> attachments) { }

    /** 浏览器可见的安全附件元数据。 */
    public record ConversationAttachment(String id, String name, String mime, long size) { }
}
