package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.llm.observability.AgentRunMetadata;
import com.exceptioncoder.toolbox.llm.observability.AgentSpan;
import com.exceptioncoder.toolbox.llm.observability.AgentTelemetry;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Consumer;

/**
 * 复用 claude-chat 的 sidecar 跑「一次性 Agent 任务」：给定 system+user prompt，
 * 经 Claude Agent SDK 跑一轮，逐片回吐文本并在结束返回全文。供其它模块（如简历「高质量」优化）调用。
 *
 * <p>不建持久会话；调用方可通过 {@link ExecutionRequest} 指定工作目录和受限工具策略。
 * requestId 以 {@code oneshot:} 前缀，由 {@link ClaudeChatService#onSidecarEvent} 分发到本服务的 {@link #handle}。
 */
@Slf4j
@Service
public class AgentOneShotService implements AgentOneShotRunner {

    private static final String PREFIX = "oneshot:";

    private final SidecarProcessRegistry processRegistry;
    private final SidecarClient sidecar;
    private final ClaudeChatProperties props;
    private final AgentTelemetry telemetry;
    private final Map<String, Call> calls = new ConcurrentHashMap<>();

    public AgentOneShotService(SidecarProcessRegistry processRegistry, SidecarClient sidecar,
                               ClaudeChatProperties props, AgentTelemetry telemetry) {
        this.processRegistry = processRegistry;
        this.sidecar = sidecar;
        this.props = props;
        this.telemetry = telemetry;
    }

    /** 阻塞跑一次，返回完整文本。 */
    public String runOnce(String systemPrompt, String userPrompt, String model, String engine) {
        return execute(new ExecutionRequest(systemPrompt, userPrompt, null, model, engine,
                null, null, null, null, null, null), null, null);
    }

    /** 按调用方提供的会话配置执行独立的一次性任务。 */
    @Override
    public String runOnce(ExecutionRequest request) {
        return executeObserved(request, null, null).text();
    }

    @Override
    public ObservedResult runObserved(ExecutionRequest request) {
        return executeObserved(request, null, null);
    }

    /** 按调用方提供的会话配置流式执行独立任务。 */
    @Override
    public String stream(ExecutionRequest request, Consumer<String> onDelta) {
        return execute(request, onDelta, null);
    }

    /** 阻塞跑一次，逐片回调 {@code onDelta}，结束返回完整文本。 */
    public String stream(String systemPrompt, String userPrompt, String model, String engine, Consumer<String> onDelta) {
        return execute(new ExecutionRequest(systemPrompt, userPrompt, null, model, engine,
                null, null, null, null, null, null), onDelta, null);
    }

    /** 附带图片的非流式执行：Claude/Codex 真正接收图片内容，不只是收到一段文字引用。 */
    @Override
    public String runOnce(String systemPrompt, String userPrompt, String model, String engine, List<ImageInput> images) {
        return execute(new ExecutionRequest(systemPrompt, userPrompt, null, model, engine,
                null, null, null, null, null, null), null, images);
    }

    /** 附带图片的流式执行；语义同 {@link #runOnce(String, String, String, List)}。 */
    @Override
    public String stream(String systemPrompt, String userPrompt, String model, String engine,
                         Consumer<String> onDelta, List<ImageInput> images) {
        return execute(new ExecutionRequest(systemPrompt, userPrompt, null, model, engine,
                null, null, null, null, null, null), onDelta, images);
    }

    private String execute(ExecutionRequest request, Consumer<String> onDelta, List<ImageInput> images) {
        return executeObserved(request, onDelta, images).text();
    }

    private ObservedResult executeObserved(ExecutionRequest request, Consumer<String> onDelta, List<ImageInput> images) {
        ensureReady();
        String id = PREFIX + UUID.randomUUID();
        String engine = normalizeEngine(request.engine());
        AgentRunMetadata metadata = AgentRunMetadata.generic(
                "agent-oneshot", id, engine, request.model());
        AgentSpan span = telemetry.start("agent.oneshot", metadata);
        Call call = new Call(onDelta);
        calls.put(id, call);
        try {
            sidecar.oneShot(id, request, engine, images, span.traceContext(), metadata);
            ObservedResult result = call.future.get(props.getAgentOneShotTimeoutMs(), TimeUnit.MILLISECONDS);
            span.success("end_turn");
            return result;
        } catch (TimeoutException e) {
            sidecar.interrupt(id);
            span.fail("timeout", e);
            long seconds = props.getAgentOneShotTimeoutMs() / 1000;
            String limit = seconds >= 60 ? (seconds / 60) + "分钟" : seconds + "s";
            throw new RuntimeException("高质量引擎超时：" + engine
                    + " 在 " + limit + " 内未返回结果", e);
        } catch (InterruptedException e) {
            // 先用未中断状态发送取消消息；Spring 的阻塞 WebSocket 发送遇到中断标记会关闭共享连接。
            try {
                sidecar.interrupt(id);
            } catch (Exception ignored) {
                // sidecar 已断开时无需二次处理，finally 仍会清理本地 call。
            } finally {
                Thread.currentThread().interrupt();
            }
            span.fail("interrupted", e);
            throw new RuntimeException("一次性 Agent 任务已取消", e);
        } catch (RuntimeException e) {
            span.fail(e.getMessage(), e);
            throw e;
        } catch (Exception e) {
            // ExecutionException：解出 sidecar 报的原因
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            span.fail(cause.getMessage(), cause);
            throw new RuntimeException(cause.getMessage(), cause);
        } finally {
            calls.remove(id);
        }
    }

    private static String normalizeEngine(String engine) {
        if (engine == null || engine.isBlank() || "claude".equalsIgnoreCase(engine)) {
            return "claude";
        }
        if ("codex".equalsIgnoreCase(engine)) {
            return "codex";
        }
        throw new IllegalArgumentException("不支持的 Agent 引擎: " + engine);
    }

    /** 由 ClaudeChatService 把 {@code oneshot:} 前缀的 sidecar 事件转发进来。 */
    public void handle(String requestId, JsonNode node) {
        Call call = calls.get(requestId);
        if (call == null) {
            return;
        }
        String type = node.path("type").asText("");
        switch (type) {
            case "assistantDelta" -> {
                String text = node.path("text").asText("");
                if (!text.isEmpty()) {
                    call.text.append(text);
                    if (call.onDelta != null) {
                        try {
                            call.onDelta.accept(text);
                        } catch (Exception e) {
                            // onDelta 抛异常（通常是 SSE 客户端断连）：
                            // 1. completeExceptionally 让 future.get() 立即解除阻塞，释放虚拟线程
                            // 2. sidecar.interrupt(requestId) 通知 sidecar 中止 Claude Agent 推理
                            //    sidecar 收到后调 session.interrupt() → AbortController.abort()，
                            //    真正停止 LLM token 生成，避免空跑浪费资源
                            log.debug("[agent-oneshot] onDelta 异常，取消任务 {} 并通知 sidecar 中断", requestId);
                            call.future.completeExceptionally(e);
                            calls.remove(requestId);
                            try {
                                sidecar.interrupt(requestId);
                            } catch (Exception ignored) {
                                // sidecar 断连时 interrupt 失败可忽略，任务会在 300s 超时后自然结束
                            }
                        }
                    }
                }
            }
            case "result" -> call.future.complete(new ObservedResult(
                    call.text.toString(), node.path("traceId").asText(null),
                    node.get("evidence"), node.get("trajectory")));
            case "error" -> {
                String message = node.path("message").asText("Claude Agent 执行失败");
                call.future.completeExceptionally(new RuntimeException("高质量引擎失败：" + message));
            }
            default -> {
                // init / models / toolUse 等忽略：oneShot 不涉及工具与会话生命周期。
            }
        }
    }

    /** 确保 sidecar 进程已启动并连接；不可用时抛出带引导的异常。 */
    private void ensureReady() {
        try {
            processRegistry.ensureStarted();
            sidecar.ensureConnected();
        } catch (IOException e) {
            throw new RuntimeException("高质量引擎不可用：无法启动/连接 Claude Agent sidecar（需已安装 node "
                    + "并构建 sidecar/claude-agent 的 dist/server.js）。原因：" + e.getMessage(), e);
        }
    }

    private static final class Call {
        final StringBuilder text = new StringBuilder();
        final Consumer<String> onDelta;
        final CompletableFuture<ObservedResult> future = new CompletableFuture<>();

        Call(Consumer<String> onDelta) {
            this.onDelta = onDelta;
        }
    }
}
