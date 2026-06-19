package com.exceptioncoder.toolbox.aichat.service;

import com.exceptioncoder.toolbox.aichat.api.dto.AttachmentRef;
import com.exceptioncoder.toolbox.aichat.api.dto.SendMessageRequest;
import com.exceptioncoder.toolbox.aichat.api.dto.UpdateConversationRequest;
import com.exceptioncoder.toolbox.aichat.config.AiChatProperties;
import com.exceptioncoder.toolbox.aichat.domain.Conversation;
import com.exceptioncoder.toolbox.aichat.domain.MessageRole;
import com.exceptioncoder.toolbox.aichat.domain.MessageStatus;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.Content;
import dev.langchain4j.data.message.ImageContent;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.TextContent;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.chat.response.StreamingChatResponseHandler;
import dev.langchain4j.model.openai.OpenAiStreamingChatModel;
import dev.langchain4j.model.openai.OpenAiTokenUsage;
import dev.langchain4j.model.output.TokenUsage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

/**
 * API 模式对话编排核心：落库用户消息 → 拼上下文 → 经 4sapi 流式补全 → 逐 token 走 SSE → 完成落库助手消息。
 *
 * <p>为避免「客户端尚未订阅 SSE 就开始流」丢首 token：{@link #send} 只准备并登记任务、返回 taskId；
 * 真正的流式在客户端打开 SSE 连接时由 {@link #openStream} 触发。</p>
 */
@Service
public class AiChatService {

    private static final Logger log = LoggerFactory.getLogger(AiChatService.class);

    private final AiChatProperties props;
    private final ConversationService conversations;
    private final ChatModelFactory modelFactory;
    private final ModelCatalogService models;
    private final AttachmentStorageService attachments;
    private final SseEmitterRegistry sse;

    private final ConcurrentHashMap<String, StreamContext> pending = new ConcurrentHashMap<>();

    public AiChatService(AiChatProperties props,
                         ConversationService conversations,
                         ChatModelFactory modelFactory,
                         ModelCatalogService models,
                         AttachmentStorageService attachments,
                         SseEmitterRegistry sse) {
        this.props = props;
        this.conversations = conversations;
        this.modelFactory = modelFactory;
        this.models = models;
        this.attachments = attachments;
        this.sse = sse;
    }

    /** 待流式的任务上下文。acc 与 finished 跨「流式 worker」与「stop 调用」两线程，访问加 ctx 锁。 */
    private static final class StreamContext {
        final String taskId;
        final String conversationId;
        final String model;
        final double temperature;
        final Integer maxTokens;
        final List<dev.langchain4j.data.message.ChatMessage> messages;
        final StringBuilder acc = new StringBuilder();
        final AtomicBoolean canceled = new AtomicBoolean(false);
        final AtomicBoolean finished = new AtomicBoolean(false);
        /** 流式真正开始的时刻（runStream 中赋值），用于算耗时；0 表示尚未开始。 */
        volatile long startedAt = 0L;
        /** 完成响应里抽出的 token 用量（中断/出错时为空，不臆造）。 */
        volatile ChatMetrics usage = ChatMetrics.EMPTY;

        StreamContext(String taskId, String conversationId, String model, double temperature,
                      Integer maxTokens, List<dev.langchain4j.data.message.ChatMessage> messages) {
            this.taskId = taskId;
            this.conversationId = conversationId;
            this.model = model;
            this.temperature = temperature;
            this.maxTokens = maxTokens;
            this.messages = messages;
        }
    }

    /** 校验 + 落库用户消息 + 登记任务，返回 taskId。 */
    public String send(SendMessageRequest req) {
        Conversation conv = conversations.require(req.conversationId());

        String model = blankToNull(req.model()) != null ? req.model() : conv.getModel();
        if (!models.isAllowed(model)) {
            throw new ResponseStatusException(BAD_REQUEST, "model 不在可用清单内");
        }
        double temperature = firstNonNull(req.temperature(), conv.getTemperature(), props.getTemperature());
        Integer maxTokens = req.maxTokens() != null ? req.maxTokens() : conv.getMaxTokens();
        validateParams(temperature, maxTokens);

        String content = req.content() == null ? "" : req.content();
        List<String> attachmentIds = req.attachmentIds() == null ? List.of() : req.attachmentIds();
        if (content.isBlank() && attachmentIds.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "消息内容与附件不能同时为空");
        }
        List<AttachmentRef> refs = new ArrayList<>();
        for (String id : attachmentIds) {
            refs.add(attachments.resolve(id));
        }
        if (!refs.isEmpty() && !models.isMultimodal(model)) {
            throw new ResponseStatusException(BAD_REQUEST, "当前模型不支持图片输入");
        }

        // 先取插入前的历史，再插入当前消息，避免重复拼当前消息。
        var priorHistory = conversations.recentHistory(conv.getId(), props.getMaxHistoryMessages());
        conversations.appendUserMessage(conv.getId(), content, refs);
        persistOverrides(conv, req, model, temperature, maxTokens);

        List<dev.langchain4j.data.message.ChatMessage> messages =
                buildMessages(conv, priorHistory, content, refs);

        String taskId = "t_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        pending.put(taskId, new StreamContext(taskId, conv.getId(), model, temperature, maxTokens, messages));
        return taskId;
    }

    /** 客户端订阅 SSE 后触发实际流式。任务不存在（无效/已停止）→ 404。 */
    public void openStream(String taskId) {
        StreamContext ctx = pending.get(taskId);
        if (ctx == null) {
            throw new ResponseStatusException(NOT_FOUND, "任务不存在或已结束");
        }
        Thread.startVirtualThread(() -> runStream(ctx));
    }

    private void runStream(StreamContext ctx) {
        OpenAiStreamingChatModel model = modelFactory.streamingModel(ctx.model, ctx.temperature, ctx.maxTokens);
        ctx.startedAt = System.currentTimeMillis();
        StreamingChatResponseHandler handler = new StreamingChatResponseHandler() {
            @Override
            public void onPartialResponse(String partialResponse) {
                if (ctx.canceled.get() || ctx.finished.get()) {
                    return;
                }
                ctx.acc.append(partialResponse);
                sse.publish(ctx.taskId, "token", Map.of("delta", partialResponse));
            }

            @Override
            public void onCompleteResponse(ChatResponse response) {
                ctx.usage = extractUsage(response);
                String text = response != null && response.aiMessage() != null
                        ? response.aiMessage().text() : ctx.acc.toString();
                finish(ctx, ctx.canceled.get() ? MessageStatus.INTERRUPTED : MessageStatus.DONE, text, null);
            }

            @Override
            public void onError(Throwable error) {
                log.warn("[ai-chat] 流式调用失败 task={}: {}", ctx.taskId, error.toString());
                finish(ctx, MessageStatus.ERROR, ctx.acc.toString(), error.getMessage());
            }
        };
        try {
            model.chat(ctx.messages, handler);
        } catch (RuntimeException e) {
            finish(ctx, MessageStatus.ERROR, ctx.acc.toString(), e.getMessage());
        }
    }

    /** 从完成响应抽 token 用量；缓存命中走 OpenAI 扩展字段，网关没给则留空（不臆造）。 */
    private static ChatMetrics extractUsage(ChatResponse response) {
        if (response == null) {
            return ChatMetrics.EMPTY;
        }
        TokenUsage tu = response.tokenUsage();
        if (tu == null) {
            return ChatMetrics.EMPTY;
        }
        Long cached = null;
        if (tu instanceof OpenAiTokenUsage oa && oa.inputTokensDetails() != null) {
            cached = boxLong(oa.inputTokensDetails().cachedTokens());
        }
        return new ChatMetrics(null, boxLong(tu.inputTokenCount()), boxLong(tu.outputTokenCount()),
                boxLong(tu.totalTokenCount()), cached);
    }

    private static Long boxLong(Integer v) {
        return v == null ? null : v.longValue();
    }

    /** 用户停止：置标志并以已生成部分收尾。 */
    public boolean stop(String taskId) {
        StreamContext ctx = pending.get(taskId);
        if (ctx == null || ctx.finished.get()) {
            return false;
        }
        ctx.canceled.set(true);
        finish(ctx, MessageStatus.INTERRUPTED, ctx.acc.toString(), null);
        return true;
    }

    /** 终止收尾：落库助手消息、推 done/error、关闭 SSE、清理任务。幂等。 */
    private void finish(StreamContext ctx, MessageStatus status, String content, String errorMessage) {
        if (!ctx.finished.compareAndSet(false, true)) {
            return;
        }
        try {
            ChatMetrics metrics = withLatency(ctx);
            var saved = conversations.appendAssistantMessage(ctx.conversationId, ctx.model, content, status, metrics);
            if (errorMessage != null) {
                sse.publish(ctx.taskId, "error", Map.of("message", errorMessage));
            }
            Map<String, Object> done = new java.util.HashMap<>();
            done.put("messageId", saved.getId());
            done.put("status", status.name());
            done.put("content", content == null ? "" : content);
            putIfPresent(done, "latencyMs", metrics.latencyMs());
            putIfPresent(done, "promptTokens", metrics.promptTokens());
            putIfPresent(done, "completionTokens", metrics.completionTokens());
            putIfPresent(done, "totalTokens", metrics.totalTokens());
            putIfPresent(done, "cachedTokens", metrics.cachedTokens());
            sse.publish(ctx.taskId, "done", done);
        } finally {
            sse.complete(ctx.taskId);
            pending.remove(ctx.taskId);
        }
    }

    /** 把流式耗时补进 token 用量；startedAt 为 0（从未开始）时耗时留空。 */
    private static ChatMetrics withLatency(StreamContext ctx) {
        Long latency = ctx.startedAt > 0 ? System.currentTimeMillis() - ctx.startedAt : null;
        ChatMetrics u = ctx.usage == null ? ChatMetrics.EMPTY : ctx.usage;
        return new ChatMetrics(latency, u.promptTokens(), u.completionTokens(), u.totalTokens(), u.cachedTokens());
    }

    private static void putIfPresent(Map<String, Object> map, String key, Long value) {
        if (value != null) {
            map.put(key, value);
        }
    }

    private List<dev.langchain4j.data.message.ChatMessage> buildMessages(
            Conversation conv, List<com.exceptioncoder.toolbox.aichat.domain.ChatMessage> history,
            String content, List<AttachmentRef> refs) {
        List<dev.langchain4j.data.message.ChatMessage> out = new ArrayList<>();
        if (conv.getSystemPrompt() != null && !conv.getSystemPrompt().isBlank()) {
            out.add(SystemMessage.from(conv.getSystemPrompt()));
        }
        for (var m : history) {
            String c = m.getContent() == null ? "" : m.getContent();
            if (m.getRole() == MessageRole.ASSISTANT) {
                out.add(AiMessage.from(c));
            } else if (m.getRole() == MessageRole.USER) {
                out.add(UserMessage.from(c));
            }
            // 历史 SYSTEM 不重复注入（系统提示以会话当前 systemPrompt 为准）。
        }
        out.add(currentUserMessage(content, refs));
        return out;
    }

    private UserMessage currentUserMessage(String content, List<AttachmentRef> refs) {
        if (refs.isEmpty()) {
            return UserMessage.from(content);
        }
        List<Content> contents = new ArrayList<>();
        if (!content.isBlank()) {
            contents.add(TextContent.from(content));
        }
        for (AttachmentRef ref : refs) {
            String base64 = Base64.getEncoder().encodeToString(attachments.readBytes(ref));
            contents.add(ImageContent.from(base64, ref.mime()));
        }
        return UserMessage.from(contents);
    }

    private void persistOverrides(Conversation conv, SendMessageRequest req,
                                  String model, double temperature, Integer maxTokens) {
        boolean changed = blankToNull(req.model()) != null && !model.equals(conv.getModel());
        boolean tempChanged = req.temperature() != null
                && (conv.getTemperature() == null || conv.getTemperature() != temperature);
        boolean maxChanged = req.maxTokens() != null
                && (conv.getMaxTokens() == null || !conv.getMaxTokens().equals(maxTokens));
        if (changed || tempChanged || maxChanged) {
            conversations.update(conv.getId(), new UpdateConversationRequest(
                    null,
                    changed ? model : null,
                    null,
                    tempChanged ? temperature : null,
                    maxChanged ? maxTokens : null));
        }
    }

    private static void validateParams(double temperature, Integer maxTokens) {
        if (temperature < 0 || temperature > 2) {
            throw new ResponseStatusException(BAD_REQUEST, "temperature 须在 [0,2]");
        }
        if (maxTokens != null && maxTokens <= 0) {
            throw new ResponseStatusException(BAD_REQUEST, "maxTokens 须大于 0");
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    private static double firstNonNull(Double a, Double b, double fallback) {
        if (a != null) {
            return a;
        }
        return b != null ? b : fallback;
    }
}
