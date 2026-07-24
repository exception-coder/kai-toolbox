package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
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
 * <p>不建持久会话、不接 MCP、不调工具——Agent 当作更强的 LLM 用，纯文本进出。
 * requestId 以 {@code oneshot:} 前缀，由 {@link ClaudeChatService#onSidecarEvent} 分发到本服务的 {@link #handle}。
 */
@Slf4j
@Service
public class AgentOneShotService implements AgentOneShotRunner {

    private static final String PREFIX = "oneshot:";

    private final SidecarProcessRegistry processRegistry;
    private final SidecarClient sidecar;
    private final ClaudeChatProperties props;
    private final Map<String, Call> calls = new ConcurrentHashMap<>();

    public AgentOneShotService(SidecarProcessRegistry processRegistry, SidecarClient sidecar,
                               ClaudeChatProperties props) {
        this.processRegistry = processRegistry;
        this.sidecar = sidecar;
        this.props = props;
    }

    /** 阻塞跑一次，返回完整文本。 */
    public String runOnce(String systemPrompt, String userPrompt, String model) {
        return execute(systemPrompt, userPrompt, model, null, null);
    }

    /** 阻塞跑一次，逐片回调 {@code onDelta}，结束返回完整文本。 */
    public String stream(String systemPrompt, String userPrompt, String model, Consumer<String> onDelta) {
        return execute(systemPrompt, userPrompt, model, onDelta, null);
    }

    /** 附带图片的非流式执行：Claude 真正"看到"图片内容，不只是收到一段文字引用。 */
    @Override
    public String runOnce(String systemPrompt, String userPrompt, String model, List<ImageInput> images) {
        return execute(systemPrompt, userPrompt, model, null, images);
    }

    /** 附带图片的流式执行；语义同 {@link #runOnce(String, String, String, List)}。 */
    @Override
    public String stream(String systemPrompt, String userPrompt, String model,
                         Consumer<String> onDelta, List<ImageInput> images) {
        return execute(systemPrompt, userPrompt, model, onDelta, images);
    }

    private String execute(String systemPrompt, String userPrompt, String model,
                           Consumer<String> onDelta, List<ImageInput> images) {
        ensureReady();
        String id = PREFIX + UUID.randomUUID();
        Call call = new Call(onDelta);
        calls.put(id, call);
        try {
            sidecar.oneShot(id, systemPrompt, userPrompt, model, images);
            return call.future.get(props.getAgentOneShotTimeoutMs(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            throw new RuntimeException("高质量引擎超时：Claude Agent 在 "
                    + (props.getAgentOneShotTimeoutMs() / 1000) + "s 内未返回结果", e);
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            // ExecutionException：解出 sidecar 报的原因
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            throw new RuntimeException(cause.getMessage(), cause);
        } finally {
            calls.remove(id);
        }
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
            case "result" -> call.future.complete(call.text.toString());
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
        final CompletableFuture<String> future = new CompletableFuture<>();

        Call(Consumer<String> onDelta) {
            this.onDelta = onDelta;
        }
    }
}
