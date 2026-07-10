package com.exceptioncoder.toolbox.aichat.service;

import com.exceptioncoder.toolbox.aichat.api.dto.AttachmentRef;
import com.exceptioncoder.toolbox.aichat.api.dto.CompletionDebug;
import com.exceptioncoder.toolbox.aichat.api.dto.SendMessageRequest;
import com.exceptioncoder.toolbox.aichat.api.dto.UpdateConversationRequest;
import com.exceptioncoder.toolbox.aichat.config.AiChatProperties;
import com.exceptioncoder.toolbox.llm.config.LlmGatewayProperties;
import com.exceptioncoder.toolbox.aichat.domain.Conversation;
import com.exceptioncoder.toolbox.aichat.domain.MessageRole;
import com.exceptioncoder.toolbox.aichat.domain.MessageStatus;
import com.exceptioncoder.toolbox.aichat.service.tools.ChatToolService;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.Content;
import dev.langchain4j.data.message.ImageContent;
import dev.langchain4j.data.message.SystemMessage;
import dev.langchain4j.data.message.TextContent;
import dev.langchain4j.data.message.ToolExecutionResultMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.request.ChatRequest;
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
    private final LlmGatewayProperties gateway;
    private final ConversationService conversations;
    private final ChatModelFactory modelFactory;
    private final ModelCatalogService models;
    private final AttachmentStorageService attachments;
    private final SseEmitterRegistry sse;
    private final ChatToolService tools;

    private final ConcurrentHashMap<String, StreamContext> pending = new ConcurrentHashMap<>();

    /** 单条用户消息内最多允许的工具循环轮数,防止模型反复调工具死循环。 */
    private static final int MAX_TOOL_ROUNDS = 8;

    public AiChatService(AiChatProperties props,
                         LlmGatewayProperties gateway,
                         ConversationService conversations,
                         ChatModelFactory modelFactory,
                         ModelCatalogService models,
                         AttachmentStorageService attachments,
                         SseEmitterRegistry sse,
                         ChatToolService tools) {
        this.props = props;
        this.gateway = gateway;
        this.conversations = conversations;
        this.modelFactory = modelFactory;
        this.models = models;
        this.attachments = attachments;
        this.sse = sse;
        this.tools = tools;
    }

    /** 待流式的任务上下文。acc 与 finished 跨「流式 worker」与「stop 调用」两线程，访问加 ctx 锁。 */
    private static final class StreamContext {
        final String taskId;
        final String conversationId;
        final String model;
        final double temperature;
        final Integer maxTokens;
        /** 工具循环中会不断追加 AiMessage / ToolExecutionResultMessage,故可变。 */
        final List<dev.langchain4j.data.message.ChatMessage> messages;
        final StringBuilder acc = new StringBuilder();
        final AtomicBoolean canceled = new AtomicBoolean(false);
        final AtomicBoolean finished = new AtomicBoolean(false);
        /** 已执行的工具循环轮数(达到 MAX_TOOL_ROUNDS 即强制收尾)。 */
        int round = 0;
        /** 累计 token 用量(跨多轮工具循环累加),终值落库。 */
        long sumPrompt = 0, sumCompletion = 0, sumTotal = 0, sumCached = 0;
        boolean anyUsage = false;
        /** 流式真正开始的时刻（runStream 中赋值），用于算耗时；0 表示尚未开始。 */
        volatile long startedAt = 0L;
        /** 请求发起时刻（登记任务时赋值），用于调试快照。 */
        volatile long requestedAt = 0L;
        /** 完成响应里抽出的 token 用量（中断/出错时为空，不臆造）。 */
        volatile ChatMetrics usage = ChatMetrics.EMPTY;
        /** 上游返回元数据：回显的模型名与结束原因（调试核验用）。 */
        volatile String responseModel;
        volatile String finishReason;

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
        // 对话接口只接受对话模型；绘图/视频模型不支持 /v1/chat/completions。
        String category = models.categoryOf(model);
        if (category != null && !"chat".equals(category)) {
            throw new ResponseStatusException(BAD_REQUEST, "该模型不是对话模型（category=" + category + "），请改用对话模型");
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
                buildMessages(conv, priorHistory, content, refs, models.isMultimodal(model));

        String taskId = "t_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        StreamContext ctx = new StreamContext(taskId, conv.getId(), model, temperature, maxTokens, messages);
        ctx.requestedAt = System.currentTimeMillis();
        pending.put(taskId, ctx);
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
        if (ctx.startedAt == 0L) {
            ctx.startedAt = System.currentTimeMillis();
        }
        OpenAiStreamingChatModel model = modelFactory.sharedModel();
        boolean applyTemp = models.supportsTemperature(ctx.model);
        ChatRequest.Builder rb = ChatRequest.builder()
                .messages(ctx.messages)
                .modelName(ctx.model);
        if (applyTemp) {
            rb.temperature(ctx.temperature);
        }
        if (ctx.maxTokens != null) {
            rb.maxOutputTokens(ctx.maxTokens);
        }
        // 带上工具规格,模型据此决定是否发起 tool_use。无工具则退化为纯对话。
        if (tools.hasTools()) {
            rb.toolSpecifications(tools.specifications());
        }
        ChatRequest request = rb.build();

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
                accumulateUsage(ctx, response);
                captureMeta(ctx, response);
                if (ctx.canceled.get()) {
                    finish(ctx, MessageStatus.INTERRUPTED, ctx.acc.toString(), null);
                    return;
                }
                AiMessage ai = response != null ? response.aiMessage() : null;
                // 模型要求调用工具 → 执行、把结果喂回、起下一轮;否则本轮即终态。
                if (ai != null && ai.hasToolExecutionRequests() && ctx.round < MAX_TOOL_ROUNDS) {
                    runToolRound(ctx, ai);
                    return;
                }
                String text = ai != null ? ai.text() : ctx.acc.toString();
                finish(ctx, MessageStatus.DONE, text, null);
            }

            @Override
            public void onError(Throwable error) {
                log.warn("[ai-chat] 流式调用失败 task={}: {}", ctx.taskId, error.toString());
                finish(ctx, MessageStatus.ERROR, ctx.acc.toString(), error.getMessage());
            }
        };
        try {
            model.chat(request, handler);
        } catch (RuntimeException e) {
            finish(ctx, MessageStatus.ERROR, ctx.acc.toString(), e.getMessage());
        }
    }

    /** 执行模型本轮请求的所有工具调用,把 AiMessage 与各 ToolExecutionResultMessage 追加进上下文,再起下一轮流式。 */
    private void runToolRound(StreamContext ctx, AiMessage ai) {
        ctx.round++;
        ctx.messages.add(ai); // 含 toolExecutionRequests 的助手消息须先入上下文
        for (ToolExecutionRequest req : ai.toolExecutionRequests()) {
            sse.publish(ctx.taskId, "tool_call",
                    Map.of("round", ctx.round, "name", req.name(), "arguments", nz(req.arguments())));
            String result = tools.execute(req);
            ctx.messages.add(ToolExecutionResultMessage.from(req, result));
            sse.publish(ctx.taskId, "tool_result",
                    Map.of("round", ctx.round, "name", req.name(), "result", capResult(result)));
        }
        // 工具结果已入上下文,继续下一轮(可能再调工具,也可能直接给出最终答复)。
        runStream(ctx);
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static final int RESULT_CAP = 500;

    private static String capResult(String s) {
        if (s == null) {
            return "";
        }
        return s.length() <= RESULT_CAP ? s : s.substring(0, RESULT_CAP) + "…(截断)";
    }

    /** 累加一轮的 token 用量到 ctx(跨工具循环求和);缓存/网关未给则跳过不臆造。 */
    private static void accumulateUsage(StreamContext ctx, ChatResponse response) {
        ChatMetrics m = extractUsage(response);
        if (m.promptTokens() != null) {
            ctx.sumPrompt += m.promptTokens();
            ctx.anyUsage = true;
        }
        if (m.completionTokens() != null) {
            ctx.sumCompletion += m.completionTokens();
            ctx.anyUsage = true;
        }
        if (m.totalTokens() != null) {
            ctx.sumTotal += m.totalTokens();
            ctx.anyUsage = true;
        }
        if (m.cachedTokens() != null) {
            ctx.sumCached += m.cachedTokens();
        }
        ctx.usage = m;
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

    /** 抓取上游返回元数据：回显的模型名与结束原因，供调试核验「上游是否动手脚」。 */
    private static void captureMeta(StreamContext ctx, ChatResponse response) {
        if (response == null) {
            return;
        }
        try {
            if (response.finishReason() != null) {
                ctx.finishReason = response.finishReason().toString();
            }
            if (response.metadata() != null && response.metadata().modelName() != null) {
                ctx.responseModel = response.metadata().modelName();
            }
        } catch (RuntimeException e) {
            log.debug("[ai-chat] 读取响应元数据失败 task={}: {}", ctx.taskId, e.toString());
        }
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
            done.put("debug", buildDebug(ctx, status, content, errorMessage, metrics));
            sse.publish(ctx.taskId, "done", done);
        } finally {
            sse.complete(ctx.taskId);
            pending.remove(ctx.taskId);
        }
    }

    /** 把流式耗时补进 token 用量；startedAt 为 0（从未开始）时耗时留空。多轮工具循环则取累计求和值。 */
    private static ChatMetrics withLatency(StreamContext ctx) {
        Long latency = ctx.startedAt > 0 ? System.currentTimeMillis() - ctx.startedAt : null;
        if (!ctx.anyUsage) {
            return new ChatMetrics(latency, null, null, null, null);
        }
        return new ChatMetrics(latency,
                ctx.sumPrompt > 0 ? ctx.sumPrompt : null,
                ctx.sumCompletion > 0 ? ctx.sumCompletion : null,
                ctx.sumTotal > 0 ? ctx.sumTotal : null,
                ctx.sumCached > 0 ? ctx.sumCached : null);
    }

    private static void putIfPresent(Map<String, Object> map, String key, Long value) {
        if (value != null) {
            map.put(key, value);
        }
    }

    /** 组装调试快照：真实请求参数 + 上下文 + 上游返回元数据。 */
    private CompletionDebug buildDebug(StreamContext ctx, MessageStatus status, String content,
                                       String errorMessage, ChatMetrics metrics) {
        // 推理模型不下发温度，调试里如实置空（与实际请求一致）。
        Double tempSent = models.supportsTemperature(ctx.model) ? ctx.temperature : null;
        List<CompletionDebug.DebugMessage> msgs = new ArrayList<>(ctx.messages.size());
        for (var m : ctx.messages) {
            msgs.add(toDebugMessage(m));
        }
        return new CompletionDebug(
                ctx.requestedAt,
                gateway.getBaseUrl(),
                ctx.model,
                tempSent,
                ctx.maxTokens,
                msgs,
                status.name(),
                ctx.responseModel,
                ctx.finishReason,
                metrics.latencyMs(),
                metrics.promptTokens(),
                metrics.completionTokens(),
                metrics.totalTokens(),
                metrics.cachedTokens(),
                content == null ? 0 : content.length(),
                errorMessage);
    }

    private static final int DEBUG_TEXT_CAP = 4000;

    /** langchain4j 消息 → 调试视图：图片只计数不带 base64，文本超长截断。 */
    private static CompletionDebug.DebugMessage toDebugMessage(dev.langchain4j.data.message.ChatMessage m) {
        if (m instanceof SystemMessage sm) {
            return new CompletionDebug.DebugMessage("SYSTEM", cap(sm.text()), 0);
        }
        if (m instanceof AiMessage am) {
            return new CompletionDebug.DebugMessage("ASSISTANT", cap(am.text()), 0);
        }
        if (m instanceof UserMessage um) {
            StringBuilder text = new StringBuilder();
            int images = 0;
            for (Content c : um.contents()) {
                if (c instanceof TextContent tc) {
                    text.append(tc.text());
                } else if (c instanceof ImageContent) {
                    images++;
                }
            }
            return new CompletionDebug.DebugMessage("USER", cap(text.toString()), images);
        }
        return new CompletionDebug.DebugMessage(m.type().name(), "", 0);
    }

    private static String cap(String s) {
        if (s == null) {
            return "";
        }
        return s.length() <= DEBUG_TEXT_CAP ? s : s.substring(0, DEBUG_TEXT_CAP) + "…(截断)";
    }

    private List<dev.langchain4j.data.message.ChatMessage> buildMessages(
            Conversation conv, List<com.exceptioncoder.toolbox.aichat.domain.ChatMessage> history,
            String content, List<AttachmentRef> refs, boolean multimodal) {
        List<dev.langchain4j.data.message.ChatMessage> out = new ArrayList<>();
        if (conv.getSystemPrompt() != null && !conv.getSystemPrompt().isBlank()) {
            out.add(SystemMessage.from(conv.getSystemPrompt()));
        }
        for (var m : history) {
            String c = m.getContent() == null ? "" : m.getContent();
            if (m.getRole() == MessageRole.ASSISTANT) {
                out.add(AiMessage.from(c));
            } else if (m.getRole() == MessageRole.USER) {
                // 历史用户消息也要带回它的图片附件，否则回头追问历史图片时模型看不到原图。
                // 仅多模态模型带图（非多模态带图会被网关拒）；读不到的旧文件跳过不阻断。
                List<AttachmentRef> histRefs = multimodal ? conversations.parseRefs(m.getAttachmentsJson()) : List.of();
                out.add(userMessage(c, histRefs));
            }
            // 历史 SYSTEM 不重复注入（系统提示以会话当前 systemPrompt 为准）。
        }
        out.add(userMessage(content, refs));
        return out;
    }

    /** 构造用户消息：无附件时纯文本；有图片附件时拼多模态内容，单张读取失败则跳过该图。 */
    private UserMessage userMessage(String content, List<AttachmentRef> refs) {
        if (refs == null || refs.isEmpty()) {
            return UserMessage.from(content == null ? "" : content);
        }
        List<Content> contents = new ArrayList<>();
        if (content != null && !content.isBlank()) {
            contents.add(TextContent.from(content));
        }
        for (AttachmentRef ref : refs) {
            try {
                String base64 = Base64.getEncoder().encodeToString(attachments.readBytes(ref));
                contents.add(ImageContent.from(base64, ref.mime()));
            } catch (RuntimeException e) {
                log.warn("[ai-chat] 历史附件读取失败，跳过 id={}: {}", ref.id(), e.toString());
            }
        }
        return contents.isEmpty() ? UserMessage.from(content == null ? "" : content) : UserMessage.from(contents);
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
