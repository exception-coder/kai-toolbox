package com.exceptioncoder.toolbox.aichat.service;

import com.exceptioncoder.toolbox.aichat.api.dto.AttachmentRef;
import com.exceptioncoder.toolbox.aichat.api.dto.AttachmentView;
import com.exceptioncoder.toolbox.aichat.api.dto.ConversationView;
import com.exceptioncoder.toolbox.aichat.api.dto.CreateConversationRequest;
import com.exceptioncoder.toolbox.aichat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.aichat.api.dto.MessageView;
import com.exceptioncoder.toolbox.aichat.api.dto.UpdateConversationRequest;
import com.exceptioncoder.toolbox.aichat.domain.ChatMessage;
import com.exceptioncoder.toolbox.aichat.domain.Conversation;
import com.exceptioncoder.toolbox.aichat.domain.MessageRole;
import com.exceptioncoder.toolbox.aichat.domain.MessageStatus;
import com.exceptioncoder.toolbox.aichat.repository.ConversationRepository;
import com.exceptioncoder.toolbox.aichat.repository.MessageRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

/** 会话与消息的业务编排（持久化 + 校验 + 视图转换）。 */
@Service
public class ConversationService {

    private static final Logger log = LoggerFactory.getLogger(ConversationService.class);
    private static final int DEFAULT_PAGE = 30;

    private final ConversationRepository convRepo;
    private final MessageRepository msgRepo;
    private final AttachmentStorageService attachments;
    private final ModelCatalogService models;
    private final ObjectMapper json;

    public ConversationService(ConversationRepository convRepo,
                               MessageRepository msgRepo,
                               AttachmentStorageService attachments,
                               ModelCatalogService models,
                               ObjectMapper json) {
        this.convRepo = convRepo;
        this.msgRepo = msgRepo;
        this.attachments = attachments;
        this.models = models;
        this.json = json;
    }

    public List<ConversationView> list() {
        return convRepo.findAllOrderByUpdatedDesc().stream().map(ConversationService::toView).toList();
    }

    public ConversationView create(CreateConversationRequest req) {
        String model = req.model();
        requireModel(model);
        validateParams(req.temperature(), req.maxTokens());
        long now = System.currentTimeMillis();
        Conversation c = Conversation.builder()
                .id("c_" + shortId())
                .title(req.title() == null || req.title().isBlank() ? "新对话" : req.title().trim())
                .model(model)
                .systemPrompt(req.systemPrompt())
                .temperature(req.temperature())
                .maxTokens(req.maxTokens())
                .createdAt(now)
                .updatedAt(now)
                .build();
        convRepo.insert(c);
        return toView(c);
    }

    public ConversationView getView(String id) {
        return toView(require(id));
    }

    public Conversation require(String id) {
        return convRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "会话不存在"));
    }

    public ConversationView update(String id, UpdateConversationRequest req) {
        Conversation c = require(id);
        if (req.title() != null) {
            c.setTitle(req.title().trim());
        }
        if (req.model() != null) {
            requireModel(req.model());
            c.setModel(req.model());
        }
        if (req.systemPrompt() != null) {
            c.setSystemPrompt(req.systemPrompt());
        }
        if (req.temperature() != null || req.maxTokens() != null) {
            validateParams(req.temperature(), req.maxTokens());
        }
        if (req.temperature() != null) {
            c.setTemperature(req.temperature());
        }
        if (req.maxTokens() != null) {
            c.setMaxTokens(req.maxTokens());
        }
        c.setUpdatedAt(System.currentTimeMillis());
        convRepo.update(c);
        return toView(c);
    }

    public void delete(String id) {
        require(id);
        // 先删消息引用的附件文件，再删消息行、会话行。
        for (ChatMessage m : msgRepo.pageBefore(id, null, Integer.MAX_VALUE)) {
            attachments.deleteByRefs(parseRefs(m.getAttachmentsJson()));
        }
        msgRepo.deleteByConversation(id);
        convRepo.deleteById(id);
    }

    public MessagePage messages(String id, String before, Integer limit) {
        require(id);
        int size = limit == null || limit <= 0 ? DEFAULT_PAGE : Math.min(limit, 100);
        List<ChatMessage> rows = msgRepo.pageBefore(id, before, size);
        boolean hasMore = !rows.isEmpty() && msgRepo.hasOlderThan(id, rows.get(0).getId());
        return new MessagePage(rows.stream().map(this::toView).toList(), hasMore);
    }

    /** 持久化一条用户消息（含附件引用），并刷新会话 updated_at。 */
    public ChatMessage appendUserMessage(String convId, String content, List<AttachmentRef> refs) {
        long now = System.currentTimeMillis();
        ChatMessage m = ChatMessage.builder()
                .id("m_" + shortId())
                .conversationId(convId)
                .role(MessageRole.USER)
                .content(content)
                .attachmentsJson(writeRefs(refs))
                .status(MessageStatus.DONE)
                .createdAt(now)
                .build();
        msgRepo.insert(m);
        convRepo.touchUpdatedAt(convId, now);
        return m;
    }

    /** 持久化一条助手消息（流式完成 / 中断 / 出错时调用）。 */
    public ChatMessage appendAssistantMessage(String convId, String model, String content, MessageStatus status) {
        long now = System.currentTimeMillis();
        ChatMessage m = ChatMessage.builder()
                .id("m_" + shortId())
                .conversationId(convId)
                .role(MessageRole.ASSISTANT)
                .content(content)
                .model(model)
                .status(status)
                .createdAt(now)
                .build();
        msgRepo.insert(m);
        convRepo.touchUpdatedAt(convId, now);
        return m;
    }

    public List<ChatMessage> recentHistory(String convId, int limit) {
        return msgRepo.findRecent(convId, limit);
    }

    public List<AttachmentRef> parseRefs(String attachmentsJson) {
        if (attachmentsJson == null || attachmentsJson.isBlank()) {
            return List.of();
        }
        try {
            return json.readValue(attachmentsJson, new TypeReference<List<AttachmentRef>>() {
            });
        } catch (JsonProcessingException e) {
            log.warn("[ai-chat] 解析 attachments_json 失败: {}", e.getMessage());
            return List.of();
        }
    }

    private String writeRefs(List<AttachmentRef> refs) {
        if (refs == null || refs.isEmpty()) {
            return null;
        }
        try {
            return json.writeValueAsString(refs);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("序列化附件引用失败", e);
        }
    }

    private void requireModel(String model) {
        if (!models.isAllowed(model)) {
            throw new ResponseStatusException(BAD_REQUEST, "model 不在可用清单内");
        }
    }

    private static void validateParams(Double temperature, Integer maxTokens) {
        if (temperature != null && (temperature < 0 || temperature > 2)) {
            throw new ResponseStatusException(BAD_REQUEST, "temperature 须在 [0,2]");
        }
        if (maxTokens != null && maxTokens <= 0) {
            throw new ResponseStatusException(BAD_REQUEST, "maxTokens 须大于 0");
        }
    }

    private static String shortId() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }

    private static ConversationView toView(Conversation c) {
        return new ConversationView(c.getId(), c.getTitle(), c.getModel(), c.getSystemPrompt(),
                c.getTemperature(), c.getMaxTokens(), c.getCreatedAt(), c.getUpdatedAt());
    }

    private MessageView toView(ChatMessage m) {
        List<AttachmentView> atts = parseRefs(m.getAttachmentsJson()).stream()
                .map(r -> new AttachmentView(r.id(), r.name(), r.mime(), "/api/ai-chat/attachments/" + r.id()))
                .toList();
        return new MessageView(m.getId(), m.getConversationId(), m.getRole().name(), m.getContent(),
                m.getModel(), atts, m.getStatus().name(), m.getCreatedAt());
    }
}
