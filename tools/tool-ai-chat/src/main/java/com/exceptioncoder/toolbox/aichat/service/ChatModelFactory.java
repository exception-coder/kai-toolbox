package com.exceptioncoder.toolbox.aichat.service;

import com.exceptioncoder.toolbox.aichat.config.AiChatProperties;
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
    private final ConcurrentHashMap<String, OpenAiStreamingChatModel> cache = new ConcurrentHashMap<>();

    public ChatModelFactory(AiChatProperties props) {
        this.props = props;
    }

    public OpenAiStreamingChatModel streamingModel(String model, double temperature, Integer maxTokens) {
        String key = model + "|" + temperature + "|" + maxTokens;
        return cache.computeIfAbsent(key, k -> build(model, temperature, maxTokens));
    }

    private OpenAiStreamingChatModel build(String model, double temperature, Integer maxTokens) {
        var b = OpenAiStreamingChatModel.builder()
                .baseUrl(props.getBaseUrl())
                .apiKey(props.getApiKey())
                .modelName(model)
                .temperature(temperature)
                .timeout(Duration.ofSeconds(props.getTimeoutSeconds()));
        if (maxTokens != null) {
            b.maxTokens(maxTokens);
        }
        return b.build();
    }

    @EventListener(EnvironmentChangeEvent.class)
    public void onConfigChange(EnvironmentChangeEvent event) {
        boolean affected = event.getKeys().stream().anyMatch(k -> k.startsWith("toolbox.ai-chat"));
        if (affected) {
            cache.clear();
            log.info("[ai-chat] 配置变更，流式模型缓存已清");
        }
    }
}
