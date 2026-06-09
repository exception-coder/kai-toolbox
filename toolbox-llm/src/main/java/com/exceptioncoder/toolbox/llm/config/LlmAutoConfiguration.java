package com.exceptioncoder.toolbox.llm.config;

import com.exceptioncoder.toolbox.llm.model.ModelSpec;
import com.exceptioncoder.toolbox.llm.routing.ChatModelRouter;
import com.exceptioncoder.toolbox.llm.routing.ModelEndpoint;
import dev.langchain4j.model.openai.OpenAiChatModel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 从 toolbox.llm.models 构建模型池并装配 {@link ChatModelRouter}。
 * 每个成员是一个 OpenAiChatModel（OpenAI 兼容协议，base-url 可本地可远端）。
 */
@Configuration
@EnableConfigurationProperties(LlmProperties.class)
public class LlmAutoConfiguration {

    private static final Logger log = LoggerFactory.getLogger(LlmAutoConfiguration.class);

    @Bean
    public ChatModelRouter chatModelRouter(LlmProperties props) {
        List<ModelSpec> specs = props.getModels();
        if (specs == null || specs.isEmpty()) {
            specs = List.of(ModelSpec.localDefault());
            log.info("[toolbox-llm] 未配置 toolbox.llm.models，兜底使用本地 Ollama: {}",
                    specs.get(0).getModel());
        }

        Map<String, List<ModelEndpoint>> byTier = new LinkedHashMap<>();
        List<ModelEndpoint> all = new ArrayList<>();
        for (ModelSpec spec : specs) {
            ModelEndpoint endpoint = new ModelEndpoint(spec, buildModel(spec));
            byTier.computeIfAbsent(spec.getTier(), k -> new ArrayList<>()).add(endpoint);
            all.add(endpoint);
            log.info("[toolbox-llm] 注册模型 id={} tier={} model={} weight={} baseUrl={}",
                    spec.getId(), spec.getTier(), spec.getModel(), spec.getWeight(), spec.getBaseUrl());
        }
        return new ChatModelRouter(byTier, all);
    }

    private static OpenAiChatModel buildModel(ModelSpec spec) {
        return OpenAiChatModel.builder()
                .baseUrl(spec.getBaseUrl())
                .apiKey(spec.getApiKey())
                .modelName(spec.getModel())
                .temperature(spec.getTemperature())
                .timeout(Duration.ofSeconds(spec.getTimeoutSeconds()))
                .logRequests(true)
                .logResponses(true)
                .build();
    }
}
