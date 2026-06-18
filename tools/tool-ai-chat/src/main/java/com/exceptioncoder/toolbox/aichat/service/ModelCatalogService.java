package com.exceptioncoder.toolbox.aichat.service;

import com.exceptioncoder.toolbox.aichat.api.dto.ModelInfo;
import com.exceptioncoder.toolbox.aichat.api.dto.ModelsView;
import com.exceptioncoder.toolbox.aichat.config.AiChatProperties;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.context.environment.EnvironmentChangeEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 模型目录：实时调 4sapi {@code GET /v1/models} 拉真实支持的模型，按配置推断多模态与展示名，
 * 结果按 {@code modelsCacheTtlSeconds} 缓存。4sapi 不可用时回退 {@code fallbackModels}。
 *
 * <p>配置中心改了 {@code toolbox.ai-chat.*}（base-url / api-key 等）后清缓存，下次重新拉取。</p>
 */
@Service
public class ModelCatalogService {

    private static final Logger log = LoggerFactory.getLogger(ModelCatalogService.class);

    private final AiChatProperties props;
    private final RestClient rest = RestClient.create();

    private volatile List<ModelInfo> cachedModels;
    private volatile long cacheExpireAt;

    public ModelCatalogService(AiChatProperties props) {
        this.props = props;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record ModelsApiResponse(List<Datum> data) {
        @JsonIgnoreProperties(ignoreUnknown = true)
        private record Datum(String id) {
        }
    }

    public ModelsView list(boolean refresh) {
        List<ModelInfo> models = remoteOrCached(refresh);
        if (models != null) {
            return new ModelsView(models, props.getPresets(), "remote");
        }
        return new ModelsView(props.getFallbackModels(), props.getPresets(), "fallback");
    }

    /** 命中即多模态：模型 id 小写后包含任一配置模式。 */
    public boolean isMultimodal(String modelId) {
        String lower = modelId.toLowerCase(Locale.ROOT);
        return props.getMultimodalPatterns().stream()
                .anyMatch(p -> lower.contains(p.toLowerCase(Locale.ROOT)));
    }

    /** 校验模型在当前可用清单内；不在则交由调用方转 400。 */
    public boolean isAllowed(String modelId) {
        if (modelId == null || modelId.isBlank()) {
            return false;
        }
        return list(false).models().stream().anyMatch(m -> m.id().equals(modelId));
    }

    /** 成功取到则返回并刷新缓存；失败返回 null（让调用方回退）。 */
    private List<ModelInfo> remoteOrCached(boolean refresh) {
        long now = System.currentTimeMillis();
        if (!refresh && cachedModels != null && now < cacheExpireAt) {
            return cachedModels;
        }
        try {
            ModelsApiResponse resp = rest.get()
                    .uri(props.getBaseUrl() + "/models")
                    .header("Authorization", "Bearer " + props.getApiKey())
                    .retrieve()
                    .body(ModelsApiResponse.class);
            if (resp == null || resp.data() == null || resp.data().isEmpty()) {
                log.warn("[ai-chat] 4sapi /models 返回空，回退静态清单");
                return null;
            }
            List<ModelInfo> models = new ArrayList<>(resp.data().size());
            for (ModelsApiResponse.Datum d : resp.data()) {
                if (d.id() == null || d.id().isBlank()) {
                    continue;
                }
                models.add(new ModelInfo(d.id(), label(d.id()), isMultimodal(d.id())));
            }
            cachedModels = List.copyOf(models);
            cacheExpireAt = now + Duration.ofSeconds(props.getModelsCacheTtlSeconds()).toMillis();
            return cachedModels;
        } catch (RuntimeException e) {
            log.warn("[ai-chat] 拉取 4sapi /models 失败，回退静态清单: {}", e.toString());
            return null;
        }
    }

    private String label(String id) {
        return props.getModelLabels().getOrDefault(id, id);
    }

    @EventListener(EnvironmentChangeEvent.class)
    public void onConfigChange(EnvironmentChangeEvent event) {
        boolean affected = event.getKeys().stream().anyMatch(k -> k.startsWith("toolbox.ai-chat"));
        if (affected) {
            cachedModels = null;
            cacheExpireAt = 0;
            log.info("[ai-chat] 配置变更，模型缓存已清");
        }
    }
}
