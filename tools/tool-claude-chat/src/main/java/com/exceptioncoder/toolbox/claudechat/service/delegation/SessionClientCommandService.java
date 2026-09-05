package com.exceptioncoder.toolbox.claudechat.service.delegation;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.exceptioncoder.toolbox.claudechat.api.dto.ServerMessage;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionClientCommand;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionClientEvent;
import com.exceptioncoder.toolbox.claudechat.config.SessionClientHandshakeInterceptor;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionAccessGrant;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientErrorCode;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientProtocol;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionCommandReceipt;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantException;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantAuditEvent;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionParticipantCommand;
import com.exceptioncoder.toolbox.claudechat.repository.SessionDelegationRepository;
import com.exceptioncoder.toolbox.claudechat.service.AttachmentStorageService;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.socket.WebSocketSession;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 执行公共白名单命令，并在调用既有会话服务前完成 Grant、配额、幂等和版本门禁。 */
@Service
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class SessionClientCommandService {

    private static final int MAX_ATTACHMENTS = 8;

    private final SessionDelegationRepository repository;
    private final AttachmentStorageService attachments;
    private final ClaudeChatService chat;
    private final SessionClientConnectionRegistry connections;
    private final ObjectMapper mapper;

    public SessionClientCommandService(SessionDelegationRepository repository,
                                       AttachmentStorageService attachments,
                                       ClaudeChatService chat,
                                       SessionClientConnectionRegistry connections,
                                       ObjectMapper mapper) {
        this.repository = repository;
        this.attachments = attachments;
        this.chat = chat;
        this.connections = connections;
        this.mapper = mapper;
    }

    @Transactional
    public SessionClientEvent send(WebSocketSession ws, SessionDelegationService.ConnectionBinding binding,
                                   SessionClientCommand.Send command, Instant now) {
        SessionClientEvent duplicate = duplicate(binding.grantId(), command.commandId());
        if (duplicate != null) return duplicate;
        SessionAccessGrant current = active(binding, command.expectedSessionVersion(), now);
        if (!chat.supportsDelegatedDevelopment(binding.sessionId())) {
            invalid("当前会话引擎尚不支持受约束委托开发");
        }
        String text = command.text() == null ? "" : command.text().trim();
        List<SessionClientCommand.Send.Attachment> requested = command.attachments() == null
                ? List.of() : List.copyOf(command.attachments());
        if (text.isEmpty() && requested.isEmpty()) invalid("消息和附件不能同时为空");
        if (requested.size() > MAX_ATTACHMENTS) invalid("单条消息附件数量超过限制");
        SessionAccessGrant updated = current.consumeTurn(text.getBytes(StandardCharsets.UTF_8).length,
                command.expectedSessionVersion(), now);
        if (!repository.updateGrant(updated, command.expectedSessionVersion())) conflict();
        ws.getAttributes().put(SessionClientHandshakeInterceptor.SESSION_VERSION_ATTRIBUTE, updated.version());

        List<ClientMessage.Send.Attachment> internalAttachments = requested.stream()
                .map(item -> resolveAttachment(binding.sessionId(), item))
                .toList();
        boolean queued = chat.isRunning(binding.sessionId());
        if (queued) {
            chat.queueDelegatedUserMessage(ws, new ClientMessage.Queue(command.commandId(), text, text,
                    null, internalAttachments.stream().map(item -> new ClientMessage.Queue.Attachment(
                            item.id(), item.name(), item.path(), item.mime())).toList(), now.toEpochMilli()),
                    binding.profile());
        } else {
            chat.sendDelegatedUserMessage(ws, new ClientMessage.Send(text, internalAttachments,
                    null, null, command.commandId()), binding.profile());
            connections.markTurnStarted(binding.grantId());
        }
        return persist(binding.grantId(), command.commandId(), SessionParticipantCommand.SEND, updated.version(),
                SessionClientEvent.data(SessionClientProtocol.VERSION, "commandAccepted", 0, updated.version(),
                        new SessionClientEvent.CommandAccepted(command.commandId(), "send", queued ? 1 : 0)), now);
    }

    @Transactional
    public SessionClientEvent answer(WebSocketSession ws, SessionDelegationService.ConnectionBinding binding,
                                     SessionClientCommand.AnswerQuestion command, Instant now) {
        SessionClientEvent duplicate = duplicate(binding.grantId(), command.commandId());
        if (duplicate != null) return duplicate;
        SessionAccessGrant current = active(binding, command.expectedSessionVersion(), now);
        ServerMessage pending = chat.pendingRequestOf(binding.sessionId()).orElse(null);
        if (!(pending instanceof ServerMessage.QuestionRequest question)
                || !question.reqId().equals(command.requestId())) {
            invalid("当前没有可由参与者回答的业务问题");
        }
        boolean delivered = chat.decisionForSession(binding.sessionId(), new ClientMessage.Decision(
                command.requestId(), "allow", null,
                command.answers() == null ? Map.of() : Map.copyOf(command.answers())));
        if (!delivered) {
            throw new SessionGrantException(SessionClientErrorCode.HOST_OFFLINE, "业务问题暂时无法送达");
        }
        return persist(binding.grantId(), command.commandId(), SessionParticipantCommand.ANSWER_QUESTION,
                current.version(), accepted(command.commandId(), "answerQuestion", current.version()), now);
    }

    @Transactional
    public SessionClientEvent interrupt(WebSocketSession ws, SessionDelegationService.ConnectionBinding binding,
                                        SessionClientCommand.InterruptOwnTurn command, Instant now) {
        SessionClientEvent duplicate = duplicate(binding.grantId(), command.commandId());
        if (duplicate != null) return duplicate;
        SessionAccessGrant current = active(binding, command.expectedSessionVersion(), now);
        if (!connections.ownsActiveTurn(binding.grantId()) || !chat.isRunning(binding.sessionId())) {
            invalid("当前没有由本参与者发起的活跃回合");
        }
        chat.interrupt(ws);
        connections.markTurnCompleted(binding.grantId());
        return persist(binding.grantId(), command.commandId(), SessionParticipantCommand.INTERRUPT_OWN_TURN,
                current.version(), accepted(command.commandId(), "interruptOwnTurn", current.version()), now);
    }

    @Transactional
    public SessionClientEvent acknowledge(SessionDelegationService.ConnectionBinding binding,
                                          SessionClientCommand.Acknowledge command, Instant now) {
        SessionClientEvent duplicate = duplicate(binding.grantId(), command.commandId());
        if (duplicate != null) return duplicate;
        SessionAccessGrant current = active(binding, command.expectedSessionVersion(), now);
        if (command.eventSeq() < 0) invalid("事件水位不能小于零");
        return persist(binding.grantId(), command.commandId(), SessionParticipantCommand.ACKNOWLEDGE,
                current.version(), accepted(command.commandId(), "acknowledge", current.version()), now);
    }

    private SessionAccessGrant active(SessionDelegationService.ConnectionBinding binding,
                                      long expectedVersion, Instant now) {
        SessionAccessGrant grant = repository.findGrant(binding.grantId())
                .orElseThrow(() -> new SessionGrantException(SessionClientErrorCode.AUTHENTICATION_REQUIRED,
                        "会话授权不可用"));
        grant.requireAccess(binding.subjectUserId(), binding.sessionId(), now);
        if (grant.version() != expectedVersion) conflict();
        return grant;
    }

    private ClientMessage.Send.Attachment resolveAttachment(
            String sessionId, SessionClientCommand.Send.Attachment requested) {
        if (requested == null || requested.id() == null || requested.id().isBlank()) {
            invalid("附件 ID 不能为空");
        }
        AttachmentStorageService.ArchivedAttachment stored = attachments.loadArchived(sessionId, requested.id());
        return new ClientMessage.Send.Attachment(stored.metadata().id(), stored.metadata().name(),
                stored.file().toString(), stored.mime());
    }

    private SessionClientEvent accepted(String commandId, String command, long version) {
        return SessionClientEvent.data(SessionClientProtocol.VERSION, "commandAccepted", 0, version,
                new SessionClientEvent.CommandAccepted(commandId, command, 0));
    }

    private SessionClientEvent persist(String grantId, String commandId, SessionParticipantCommand type,
                                       long version, SessionClientEvent event, Instant now) {
        requireCommandId(commandId);
        try {
            SessionCommandReceipt receipt = new SessionCommandReceipt(UUID.randomUUID().toString(), grantId,
                    commandId, type, version, mapper.writeValueAsString(event), now, now);
            if (!repository.insertCommandReceipt(receipt)) return duplicate(grantId, commandId);
            repository.insertAudit(new SessionGrantAuditEvent(UUID.randomUUID().toString(), grantId, null,
                    "PARTICIPANT_" + type.name(), "SUCCESS", commandId, null, now, now));
            return event;
        } catch (JsonProcessingException exception) {
            throw new SessionGrantException(SessionClientErrorCode.SERVER_ERROR, "命令回执暂时无法保存");
        }
    }

    private SessionClientEvent duplicate(String grantId, String commandId) {
        requireCommandId(commandId);
        return repository.findCommandReceipt(grantId, commandId).map(receipt -> {
            try {
                return mapper.readValue(receipt.resultJson(), SessionClientEvent.class);
            } catch (JsonProcessingException exception) {
                throw new SessionGrantException(SessionClientErrorCode.SERVER_ERROR, "命令回执暂时无法读取");
            }
        }).orElse(null);
    }

    private static void requireCommandId(String commandId) {
        if (commandId == null || commandId.isBlank() || commandId.length() > 128) {
            invalid("commandId 不合法");
        }
    }

    private static void conflict() {
        throw new SessionGrantException(SessionClientErrorCode.SESSION_VERSION_CONFLICT,
                "授权版本已更新，请刷新会话后重试");
    }

    private static void invalid(String message) {
        throw new SessionGrantException(SessionClientErrorCode.INVALID_INPUT, message);
    }
}
