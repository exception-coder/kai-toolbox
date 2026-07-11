package com.exceptioncoder.toolbox.llm.routing;

import com.exceptioncoder.toolbox.llm.model.ModelSpec;
import com.exceptioncoder.toolbox.llm.spi.LlmCredentialFallback;
import dev.langchain4j.model.ModelProvider;
import dev.langchain4j.model.chat.Capability;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.listener.ChatModelListener;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.request.ChatRequestParameters;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.model.openai.OpenAiChatModel;

import java.time.Duration;
import java.util.List;
import java.util.Set;

/**
 * 「空 key」成员的懒取凭据 ChatModel 包装：每次调用从 {@link LlmCredentialFallback} 取中心 LLM 网关的实时 apiKey/baseUrl，
 * 仅当凭据较上次变化时才重建底层 {@link OpenAiChatModel}。
 *
 * <p>如此，网关里未显式配 key 的档位（java8gu / visitor）能复用用户在「LLM 网关」配置好的 key，
 * 且用户改 key 后下次调用即生效、无需重启。ChatModel 方法面与 {@link RoutingChatModel} 一致（4 个）。</p>
 */
public class LazyCredentialChatModel implements ChatModel {

    private final ModelSpec spec;
    private final ChatModelListener listener; // 可空
    private final LlmCredentialFallback fallback;

    private volatile String curKey;
    private volatile String curBaseUrl;
    private volatile ChatModel delegate;

    public LazyCredentialChatModel(ModelSpec spec, ChatModelListener listener, LlmCredentialFallback fallback) {
        this.spec = spec;
        this.listener = listener;
        this.fallback = fallback;
    }

    /** 取实时凭据；与缓存不同或首次则重建委托。baseUrl 兜底用成员自身配置。 */
    private synchronized ChatModel resolve() {
        String key = fallback.apiKey();
        if (key == null) {
            key = "";
        }
        String base = fallback.baseUrl();
        if (base == null || base.isBlank()) {
            base = spec.getBaseUrl();
        }
        if (delegate == null || !key.equals(curKey) || !base.equals(curBaseUrl)) {
            curKey = key;
            curBaseUrl = base;
            delegate = build(spec, base, key, listener);
        }
        return delegate;
    }

    /** 与 LlmAutoConfiguration 静态构建同款 builder，只是 baseUrl/apiKey 显式传入。 */
    private static ChatModel build(ModelSpec spec, String baseUrl, String apiKey, ChatModelListener listener) {
        OpenAiChatModel.OpenAiChatModelBuilder builder = OpenAiChatModel.builder()
                .baseUrl(baseUrl)
                .apiKey(apiKey)
                .modelName(spec.getModel())
                .temperature(spec.getTemperature())
                .timeout(Duration.ofSeconds(spec.getTimeoutSeconds()))
                .logRequests(true)
                .logResponses(true);
        if (listener != null) {
            builder.listeners(List.of(listener));
        }
        return builder.build();
    }

    @Override
    public ChatResponse chat(ChatRequest chatRequest) {
        return resolve().chat(chatRequest);
    }

    @Override
    public Set<Capability> supportedCapabilities() {
        return resolve().supportedCapabilities();
    }

    @Override
    public ChatRequestParameters defaultRequestParameters() {
        return resolve().defaultRequestParameters();
    }

    @Override
    public ModelProvider provider() {
        return resolve().provider();
    }
}
