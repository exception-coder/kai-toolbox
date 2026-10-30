package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.QueuedChatMessage;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.QueuedChatMessageRepository;
import com.exceptioncoder.toolbox.claudechat.repository.QueueDeliveryStore;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionManualInputEvent;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/** 待发送消息的会话归属校验与持久化编排。 */
@Service
public class QueuedChatMessageService {

    private final QueuedChatMessageRepository repository;
    private final ClaudeChatSessionRepository sessionRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final QueueDeliveryStore deliveryStore;

    @Autowired
    public QueuedChatMessageService(QueuedChatMessageRepository repository,
                                    ClaudeChatSessionRepository sessionRepository,
                                    ApplicationEventPublisher eventPublisher, QueueDeliveryStore deliveryStore) {
        this.repository = repository;
        this.sessionRepository = sessionRepository;
        this.eventPublisher = eventPublisher;
        this.deliveryStore = deliveryStore;
    }

    QueuedChatMessageService(QueuedChatMessageRepository repository,
                             ClaudeChatSessionRepository sessionRepository) {
        this(repository, sessionRepository, event -> { }, null);
    }

    public List<QueuedChatMessage> list(String sessionId) {
        requireSession(sessionId);
        var messages = repository.findBySessionId(sessionId);
        if (deliveryStore == null) return messages;
        var delivery = deliveryStore.delivery(sessionId);
        var runtime = deliveryStore.runtime(sessionId).orElse(null);
        return messages.stream().map(m -> delivery.filter(d -> d.messageId().equals(m.id()))
                .map(d -> {
                    if (runtime != null && runtime.checking()) {
                        String note = runtime.checkAttempts() >= 3 && runtime.stopReason() != null
                                ? "连续三次追问仍未确认完成，队列已挂起；请核对后继续。"
                                : "正在核对当前任务是否完成（" + runtime.checkAttempts() + "/3）";
                        return m.withDelivery(d.status(), note);
                    }
                    return m.withDelivery(d.status(), d.note());
                }).orElseGet(() -> {
                    if (runtime == null || runtime.ready() || messages.isEmpty() || !messages.getFirst().id().equals(m.id())) return m;
                    if (runtime.checkAttempts() >= 3 && runtime.stopReason() != null) return m.withDelivery("BLOCKED",
                            "当前任务连续三次追问仍未确认完成；请核对后继续队列。");
                    if (runtime.checking()) return m.withDelivery("CHECKING", "正在追问上一项任务是否完成（" + runtime.checkAttempts() + "/3）");
                    return m;
                })).toList();
    }

    @Transactional
    public QueuedChatMessage save(String sessionId, String id, String text, String displayText,
                                  String developerInstructions, List<QueuedChatMessage.Attachment> attachments,
                                  Long createdAt) {
        requireSession(sessionId);
        if (id == null || id.isBlank()) throw new IllegalArgumentException("队列消息 ID 不能为空");
        if (id.trim().startsWith("autopilot:")) {
            throw new IllegalArgumentException("自动监督消息标识由服务端保留，请使用新的用户消息 ID");
        }
        String normalizedText = text == null ? "" : text.trim();
        List<QueuedChatMessage.Attachment> normalizedAttachments = attachments == null ? List.of() : List.copyOf(attachments);
        if (normalizedText.isEmpty() && normalizedAttachments.isEmpty()) {
            throw new IllegalArgumentException("队列消息文本和附件不能同时为空");
        }
        QueuedChatMessage message = new QueuedChatMessage(
                id.trim(), sessionId, normalizedText, trimOrNull(displayText),
                trimOrNull(developerInstructions), normalizedAttachments,
                createdAt == null || createdAt <= 0 ? System.currentTimeMillis() : createdAt);
        var existing = repository.findBySessionId(sessionId).stream().filter(m -> m.id().equals(message.id())).findFirst();
        if (existing.isPresent()) return existing.get(); // 同一业务 ID 重试复用原文，不能覆盖正在派发的输入。
        repository.upsert(message);
        eventPublisher.publishEvent(new SessionManualInputEvent(sessionId, "QUEUE"));
        eventPublisher.publishEvent(new QueueChangedEvent(sessionId));
        return message;
    }

    /** Runtime 自身登记的续跑消息，不触发用户接管；幂等 ID 由监督服务提供。 */
    public QueuedChatMessage saveInternal(String sessionId, String id, String text,
                                          String displayText, String developerInstructions,
                                          Long createdAt) {
        requireSession(sessionId);
        if (id == null || !id.startsWith("autopilot:")
                || developerInstructions == null || developerInstructions.isBlank()) {
            throw new IllegalArgumentException("自动监督续跑消息缺少服务端身份或上下文");
        }
        QueuedChatMessage message = new QueuedChatMessage(id, sessionId, text, displayText,
                null, List.of(), createdAt == null ? System.currentTimeMillis() : createdAt, developerInstructions);
        repository.upsert(message);
        eventPublisher.publishEvent(new QueueChangedEvent(sessionId));
        return message;
    }

    /** 清除尚未派发的 Runtime 续跑消息，不影响用户自己的排队内容。 */
    public void clearInternal(String sessionId) {
        repository.findBySessionId(sessionId).stream()
                .filter(message -> message.id().startsWith("autopilot:"))
                .filter(message -> deliveryStore == null || deliveryStore.delivery(sessionId)
                        .filter(d -> d.messageId().equals(message.id())).isEmpty())
                .forEach(message -> repository.delete(sessionId, message.id()));
    }

    public boolean hasInternal(String sessionId) {
        return repository.findBySessionId(sessionId).stream()
                .anyMatch(message -> message.id().startsWith("autopilot:"));
    }

    public boolean firstIsInternal(String sessionId) {
        return repository.findFirstBySessionId(sessionId)
                .map(message -> message.id().startsWith("autopilot:"))
                .orElse(false);
    }

    public void delete(String sessionId, String messageId) {
        requireSession(sessionId);
        if (deliveryStore == null) repository.delete(sessionId, messageId);
        else deliveryStore.removePending(sessionId, messageId);
    }

    @Transactional
    public void clear(String sessionId) {
        requireSession(sessionId);
        for (var message : repository.findBySessionId(sessionId)) delete(sessionId, message.id());
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
