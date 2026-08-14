package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.QueuedChatMessage;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.QueuedChatMessageRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/** 待发送消息的会话归属校验与持久化编排。 */
@Service
public class QueuedChatMessageService {

    private final QueuedChatMessageRepository repository;
    private final ClaudeChatSessionRepository sessionRepository;

    public QueuedChatMessageService(QueuedChatMessageRepository repository,
                                    ClaudeChatSessionRepository sessionRepository) {
        this.repository = repository;
        this.sessionRepository = sessionRepository;
    }

    public List<QueuedChatMessage> list(String sessionId) {
        requireSession(sessionId);
        return repository.findBySessionId(sessionId);
    }

    public QueuedChatMessage save(String sessionId, String id, String text, String displayText,
                                  String developerInstructions, List<QueuedChatMessage.Attachment> attachments,
                                  Long createdAt) {
        requireSession(sessionId);
        if (id == null || id.isBlank()) throw new IllegalArgumentException("队列消息 ID 不能为空");
        String normalizedText = text == null ? "" : text.trim();
        List<QueuedChatMessage.Attachment> normalizedAttachments = attachments == null ? List.of() : List.copyOf(attachments);
        if (normalizedText.isEmpty() && normalizedAttachments.isEmpty()) {
            throw new IllegalArgumentException("队列消息文本和附件不能同时为空");
        }
        QueuedChatMessage message = new QueuedChatMessage(
                id.trim(), sessionId, normalizedText, trimOrNull(displayText),
                trimOrNull(developerInstructions), normalizedAttachments,
                createdAt == null || createdAt <= 0 ? System.currentTimeMillis() : createdAt);
        repository.upsert(message);
        return message;
    }

    public void delete(String sessionId, String messageId) {
        requireSession(sessionId);
        repository.delete(sessionId, messageId);
    }

    /** 原子取得并删除队首；并发调度者只有一个能成功领取同一条消息。 */
    @Transactional
    public Optional<QueuedChatMessage> takeFirst(String sessionId) {
        Optional<QueuedChatMessage> first = repository.findFirstBySessionId(sessionId);
        if (first.isEmpty()) {
            return Optional.empty();
        }
        QueuedChatMessage message = first.get();
        return repository.delete(sessionId, message.id()) ? Optional.of(message) : Optional.empty();
    }

    /** 下一轮启动失败时恢复已经领取的队列消息。 */
    public void restore(QueuedChatMessage message) {
        repository.upsert(message);
    }

    public void clear(String sessionId) {
        requireSession(sessionId);
        repository.deleteBySessionId(sessionId);
    }

    private void requireSession(String sessionId) {
        if (sessionRepository.findById(sessionId).isEmpty()) {
            throw new IllegalArgumentException("会话不存在：" + sessionId);
        }
    }

    private static String trimOrNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
