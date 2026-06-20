package com.exceptioncoder.toolbox.llm.config;

import com.exceptioncoder.toolbox.llm.model.ModelSpec;
import com.exceptioncoder.toolbox.llm.monitor.LlmCostCalculator;
import com.exceptioncoder.toolbox.llm.monitor.LlmMetricsRecorder;
import com.exceptioncoder.toolbox.llm.monitor.LlmMetricsRegistry;
import com.exceptioncoder.toolbox.llm.monitor.LlmTokenEstimator;
import com.exceptioncoder.toolbox.llm.monitor.MeteredChatModel;
import com.exceptioncoder.toolbox.llm.monitor.QuotaGuardChatModel;
import com.exceptioncoder.toolbox.llm.routing.ChatModelRouter;
import com.exceptioncoder.toolbox.llm.routing.ModelEndpoint;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;

/**
 * 从 toolbox.llm.models 构建模型池并装配 {@link ChatModelRouter}。
 * 每个成员是一个 OpenAiChatModel（OpenAI 兼容协议，base-url 可本地可远端）。
 *
 * <p>当监控启用且监控组件就绪时，给每个池成员包 {@link MeteredChatModel}（计量），
 * 给每个 tier 包 {@link QuotaGuardChatModel}（配额闸门 + 计量边界），对消费方与路由完全透明。
 */
@Configuration
@EnableConfigurationProperties(LlmProperties.class)
public class LlmAutoConfiguration {

    private static final Logger log = LoggerFactory.getLogger(LlmAutoConfiguration.class);

    @Bean
    public ChatModelRouter chatModelRouter(LlmProperties props,
                                           ObjectProvider<LlmMetricsRecorder> recorderProvider,
                                           ObjectProvider<LlmMetricsRegistry> registryProvider,
                                           ObjectProvider<LlmCostCalculator> costProvider,
                                           ObjectProvider<LlmTokenEstimator> estimatorProvider) {
        List<ModelSpec> specs = props.getModels();
        if (specs == null || specs.isEmpty()) {
            specs = List.of(ModelSpec.localDefault());
            log.info("[toolbox-llm] 未配置 toolbox.llm.models，兜底使用本地 Ollama: {}",
                    specs.get(0).getModel());
        }

        MonitorProperties monitor = props.getMonitor();
        LlmMetricsRecorder recorder = recorderProvider.getIfAvailable();
        LlmMetricsRegistry registry = registryProvider.getIfAvailable();
        LlmCostCalculator cost = costProvider.getIfAvailable();
        LlmTokenEstimator estimator = estimatorProvider.getIfAvailable();
        boolean monitoring = monitor.isEnabled() && recorder != null && registry != null
                && cost != null && estimator != null;

        Map<String, List<ModelEndpoint>> byTier = new LinkedHashMap<>();
        List<ModelEndpoint> all = new ArrayList<>();
        for (ModelSpec spec : specs) {
            ChatModel base = buildModel(spec);
            ChatModel member = monitoring
                    ? new MeteredChatModel(spec, base, recorder, cost, estimator)
                    : base;
            ModelEndpoint endpoint = new ModelEndpoint(spec, member);
            byTier.computeIfAbsent(spec.getTier(), k -> new ArrayList<>()).add(endpoint);
            all.add(endpoint);
            log.info("[toolbox-llm] 注册模型 id={} tier={} model={} weight={} baseUrl={} 监控={}",
                    spec.getId(), spec.getTier(), spec.getModel(), spec.getWeight(),
                    spec.getBaseUrl(), monitoring);
        }

        if (monitoring) {
            BiFunction<String, ChatModel, ChatModel> guard = (tier, routing) ->
                    new QuotaGuardChatModel(tier, routing, registry, recorder, monitor);
            return new ChatModelRouter(byTier, all, guard);
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
