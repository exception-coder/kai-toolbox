package com.exceptioncoder.toolbox.aichat.service;

import com.exceptioncoder.toolbox.aichat.config.AiChatProperties;
import com.exceptioncoder.toolbox.llm.config.LlmGatewayProperties;
import dev.langchain4j.model.openai.OpenAiStreamingChatModel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.context.environment.EnvironmentChangeEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 按 (模型, 温度, maxTokens) 构建并缓存 {@link OpenAiStreamingChatModel}，全部指向 4sapi。
 * 配置中心改了连接参数后清缓存，下次按新值重建。
 */
@Service
public class ChatModelFactory {

    private static final Logger log = LoggerFactory.getLogger(ChatModelFactory.class);

    private final AiChatProperties props;
    private final LlmGatewayProperties gateway;
    private final ModelCatalogService models;
    private final ConcurrentHashMap<String, OpenAiStreamingChatModel> cache = new ConcurrentHashMap<>();

    public ChatModelFactory(AiChatProperties props, LlmGatewayProperties gateway, ModelCatalogService models) {
        this.props = props;
        this.gateway = gateway;
        this.models = models;
    }

    public OpenAiStreamingChatModel streamingModel(String model, double temperature, Integer maxTokens) {
        // 推理模型不下发 temperature（网关会拒绝），缓存键也据此归一，避免按温度堆冗余实例。
        boolean applyTemp = models.supportsTemperature(model);
        String key = model + "|" + (applyTemp ? temperature : "default") + "|" + maxTokens;
        return cache.computeIfAbsent(key, k -> build(model, applyTemp ? temperature : null, maxTokens));
    }

    /**
     * 工具循环用的「裸」流式模型：仅按 baseUrl/key 建一个,模型名/温度/maxTokens 改由
     * 每轮 ChatRequest 下发(因工具循环需在同一连接参数下反复请求、并按需带 toolSpecifications)。
     */
    public OpenAiStreamingChatModel sharedModel() {
        return cache.computeIfAbsent("__shared__", k -> OpenAiStreamingChatModel.builder()
                .baseUrl(gateway.getBaseUrl())
                .apiKey(gateway.getApiKey())
                .modelName("gpt-4o-mini") // 占位,实际以 ChatRequest.modelName 为准
                .timeout(Duration.ofSeconds(props.getTimeoutSeconds()))
                .build());
    }

    private OpenAiStreamingChatModel build(String model, Double temperature, Integer maxTokens) {
        var b = OpenAiStreamingChatModel.builder()
                .baseUrl(gateway.getBaseUrl())
                .apiKey(gateway.getApiKey())
                .modelName(model)
                .timeout(Duration.ofSeconds(props.getTimeoutSeconds()));
        if (temperature != null) {
            b.temperature(temperature);
        }
        if (maxTokens != null) {
            b.maxTokens(maxTokens);
        }
        return b.build();
    }

    @EventListener(EnvironmentChangeEvent.class)
    public void onConfigChange(EnvironmentChangeEvent event) {
        boolean affected = event.getKeys().stream().anyMatch(k -> k.startsWith("toolbox.ai-chat") || k.startsWith("toolbox.llm.gateway"));
        if (affected) {
            cache.clear();
            log.info("[ai-chat] 配置变更，流式模型缓存已清");
        }
    }
}
