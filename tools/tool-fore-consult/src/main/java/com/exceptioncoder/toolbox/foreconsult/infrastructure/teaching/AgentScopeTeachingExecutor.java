package com.exceptioncoder.toolbox.foreconsult.infrastructure.teaching;

import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingAgentExecutor;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingConfig;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingRun;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingScenario;
import com.exceptioncoder.toolbox.llm.config.LlmGatewayProperties;
import io.agentscope.core.ReActAgent;
import io.agentscope.core.message.GenerateReason;
import io.agentscope.core.model.ExecutionConfig;
import io.agentscope.core.model.GenerateOptions;
import io.agentscope.core.model.Model;
import io.agentscope.core.tool.Toolkit;
import io.agentscope.extensions.model.openai.OpenAIChatModel;
import java.time.Duration;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** 在既有平台运行 AgentScope，所有配置和凭据由服务端提供。 */
@Component
public class AgentScopeTeachingExecutor implements TeachingAgentExecutor {
    private final LlmGatewayProperties gateway;

    public AgentScopeTeachingExecutor(LlmGatewayProperties gateway) {
        this.gateway = gateway;
    }

    @Override
    public boolean liveAvailable() {
        return gateway.getApiKey() != null && !gateway.getApiKey().isBlank();
    }

    @Override
    public TeachingRun execute(TeachingConfig config, TeachingRequest request) {
        config.validate();
        request.validate();
        TeachingTrace trace = new TeachingTrace();
        trace.add("INPUT", "契约 " + TeachingConfig.CONTRACT_VERSION + " · 配置 v" + request.version());
        String status = "COMPLETED";
        String answer;
        try (ReActAgent agent = build(config, request, trace)) {
            String input = request.input();
            if (request.previous() != null) {
                input = "上一份教学草稿：款号=" + request.previous().styleCode()
                        + "，数量=" + request.previous().quantity() + "\n本轮用户输入：" + input;
            }
            var reply = agent.call(input).block(Duration.ofSeconds(config.timeoutSeconds()));
            if (reply == null || trace.draft() == null || reply.getGenerateReason() == GenerateReason.MAX_ITERATIONS
                    || reply.getGenerateReason() == GenerateReason.INTERRUPTED) {
                status = "INCOMPLETE";
                trace.draft(null);
                answer = "本轮未生成已校验草稿。请补充信息，或检查工具和最大轮数后重试。";
            } else {
                answer = reply.getTextContent();
            }
        } catch (RuntimeException failure) {
            status = "FAILED";
            trace.draft(null);
            answer = "运行未完成（" + failure.getClass().getSimpleName()
                    + "）。请检查网关、模型权限、超时配置后重试。";
            trace.add("ERROR", answer);
        }
        trace.add("END", status);
        return new TeachingRun(UUID.randomUUID().toString(), request.version(), request.mode(), request.input(),
                status, answer, trace.draft(), trace.steps(), trace.elapsed(), trace.tokens(), System.currentTimeMillis());
    }

    private ReActAgent build(TeachingConfig config, TeachingRequest request, TeachingTrace trace) {
        Toolkit toolkit = new Toolkit();
        toolkit.registerTool(new TeachingOrderTools(config.maxQuantity(), trace));
        if (config.lookupEnabled()) {
            toolkit.registerTool(new TeachingOrderTools.Lookup(trace));
        }
        GenerateOptions options = GenerateOptions.builder().temperature(config.temperature())
                .maxTokens(config.maxOutputTokens()).build();
        Model model;
        if ("DEMO".equals(request.mode())) {
            trace.add("MODE", "固定场景脚本；不证明自然语言理解能力");
            model = new ScriptedOrderModel(TeachingScenario.find(request.scenarioId()), config.lookupEnabled());
        } else {
            if (!liveAvailable()) {
                throw new IllegalStateException("统一网关未配置");
            }
            model = OpenAIChatModel.builder().apiKey(gateway.getApiKey()).baseUrl(gateway.getBaseUrl())
                    .modelName(config.model()).generateOptions(options).stream(true).build();
        }
        return ReActAgent.builder().name(TeachingConfig.AGENT_ID).sysPrompt(config.prompt())
                .model(new ObservedTeachingModel(model, trace)).toolkit(toolkit).generateOptions(options)
                .maxIters(config.maxIterations()).maxRetries(config.retries() + 1)
                // SDK 的 maxRetries 实际为总尝试次数；UI 表达的是额外重试次数。
                .modelExecutionConfig(ExecutionConfig.builder().maxAttempts(config.retries() + 1)
                        .timeout(Duration.ofSeconds(config.timeoutSeconds())).build()).build();
    }
}
