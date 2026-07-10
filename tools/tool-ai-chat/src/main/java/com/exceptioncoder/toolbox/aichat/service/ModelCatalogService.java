package com.exceptioncoder.toolbox.aichat.service;

import com.exceptioncoder.toolbox.aichat.api.dto.ModelInfo;
import com.exceptioncoder.toolbox.aichat.api.dto.ModelsView;
import com.exceptioncoder.toolbox.aichat.config.AiChatProperties;
import com.exceptioncoder.toolbox.llm.config.LlmGatewayProperties;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.context.environment.EnvironmentChangeEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

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
    private final LlmGatewayProperties gateway;
    private final RestClient rest = RestClient.create();

    private volatile List<ModelInfo> cachedModels;
    private volatile long cacheExpireAt;

    public ModelCatalogService(AiChatProperties props, LlmGatewayProperties gateway) {
        this.props = props;
        this.gateway = gateway;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record ModelsApiResponse(List<Datum> data) {
        @JsonIgnoreProperties(ignoreUnknown = true)
        private record Datum(String id) {
        }
    }

    /** New API 网关 /api/pricing 响应（仅取我们要的字段）。 */
    @JsonIgnoreProperties(ignoreUnknown = true)
    private record PricingResponse(boolean success, List<PricingEntry> data) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record PricingEntry(String model_name, String tags, String description, double model_ratio,
                                List<String> supported_endpoint_types) {
    }

    /** 单个模型的能力元数据（由 pricing 富化）。 */
    private record ModelMeta(List<String> tags, String description, double priceRatio, List<String> endpointTypes) {
        static final ModelMeta EMPTY = new ModelMeta(List.of(), null, 0, List.of());
    }

    private static final List<String> IMAGE_ENDPOINTS = List.of("image-generation", "image-edits");
    private static final List<String> VIDEO_ENDPOINTS = List.of("openai-video", "video");
    private static final List<String> OTHER_ENDPOINTS = List.of("audio", "embeddings", "rerank");
    /** 视频规格标签子串（如「支持720p、1080p」「时长4秒8秒12秒」）。 */
    private static final List<String> VIDEO_TAG_MARKERS = List.of("720p", "1080p", "分辨率", "时长");

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

    /**
     * 按能力把模型分类：chat（可走 /v1/chat/completions）/ image（绘图）/ video（视频）/ other（音频/向量等）。
     * 判据：配置的名称家族 + pricing 端点类型 + 视频规格标签。pricing 不可用时仅靠名称家族。
     * 顺序：先视频、再绘图、再 other，剩下为 chat。供前端「对话/绘图/视频」模式按类筛选。
     */
    public String classify(String modelId, ModelMeta meta) {
        String lower = modelId == null ? "" : modelId.toLowerCase(Locale.ROOT);
        var et = meta.endpointTypes();
        if (matchesAny(lower, props.getVideoModelPatterns())
                || et.stream().anyMatch(VIDEO_ENDPOINTS::contains)
                || meta.tags().stream().anyMatch(t -> VIDEO_TAG_MARKERS.stream().anyMatch(t::contains))) {
            return "video";
        }
        if (matchesAny(lower, props.getImageModelPatterns()) || et.stream().anyMatch(IMAGE_ENDPOINTS::contains)) {
            return "image";
        }
        if (matchesAny(lower, props.getOtherModelPatterns()) || et.stream().anyMatch(OTHER_ENDPOINTS::contains)) {
            return "other";
        }
        return "chat";
    }

    private static boolean matchesAny(String lower, List<String> patterns) {
        return patterns.stream().anyMatch(p -> lower.contains(p.toLowerCase(Locale.ROOT)));
    }

    /**
     * 是否支持自定义温度。以模型清单中已算好的权威结果为准(优先 pricing 能力标签);
     * 模型不在清单或为空时,回退到名称推断。空 id 按支持处理。
     */
    public boolean supportsTemperature(String modelId) {
        if (modelId == null || modelId.isBlank()) {
            return true;
        }
        return list(false).models().stream()
                .filter(m -> m.id().equals(modelId))
                .findFirst()
                .map(ModelInfo::supportsTemperature)
                .orElseGet(() -> supportsTemperatureByName(modelId));
    }

    /** 名称推断:命中 noTemperaturePatterns(推理模型)则不支持。仅作 pricing 不可用时的兜底。 */
    private boolean supportsTemperatureByName(String modelId) {
        String lower = modelId.toLowerCase(Locale.ROOT);
        return props.getNoTemperaturePatterns().stream()
                .noneMatch(p -> lower.contains(p.toLowerCase(Locale.ROOT)));
    }

    /**
     * 判定某模型是否支持自定义温度,供 enrich 时算入 ModelInfo。
     * pricing 可用时以能力标签为准(被标「推理」→ 不支持);pricing 不可用则回退名称推断。
     */
    private boolean resolveSupportsTemperature(String modelId, ModelMeta meta, boolean pricingOk) {
        if (pricingOk && meta.tags().contains("推理")) {
            return false;
        }
        return supportsTemperatureByName(modelId);
    }

    /** 校验模型在当前可用清单内；不在则交由调用方转 400。 */
    public boolean isAllowed(String modelId) {
        if (modelId == null || modelId.isBlank()) {
            return false;
        }
        return list(false).models().stream().anyMatch(m -> m.id().equals(modelId));
    }

    /** 取模型的能力分类（chat/image/video）；不在清单返回 null。供请求端按模式校验。 */
    public String categoryOf(String modelId) {
        if (modelId == null || modelId.isBlank()) {
            return null;
        }
        return list(false).models().stream()
                .filter(m -> m.id().equals(modelId))
                .findFirst()
                .map(com.exceptioncoder.toolbox.aichat.api.dto.ModelInfo::category)
                .orElse(null);
    }

    /** 成功取到则返回并刷新缓存；失败返回 null（让调用方回退）。 */
    private List<ModelInfo> remoteOrCached(boolean refresh) {
        long now = System.currentTimeMillis();
        if (!refresh && cachedModels != null && now < cacheExpireAt) {
            return cachedModels;
        }
        try {
            ModelsApiResponse resp = rest.get()
                    .uri(gateway.getBaseUrl() + "/models")
                    .header("Authorization", "Bearer " + gateway.getApiKey())
                    .retrieve()
                    .body(ModelsApiResponse.class);
            if (resp == null || resp.data() == null || resp.data().isEmpty()) {
                log.warn("[ai-chat] 4sapi /models 返回空，回退静态清单");
                return null;
            }
            // 先刷新能力元数据（pricing）。pricing 可用时一律以其为准、绝不按名称猜；
            // 仅当 pricing 整体不可达（空表）时，才降级到按模型名推断多模态。
            Map<String, ModelMeta> meta = fetchPricing();
            boolean pricingOk = !meta.isEmpty();
            List<ModelInfo> models = new ArrayList<>(resp.data().size());
            for (ModelsApiResponse.Datum d : resp.data()) {
                if (d.id() == null || d.id().isBlank()) {
                    continue;
                }
                ModelMeta mm = meta.getOrDefault(d.id(), ModelMeta.EMPTY);
                String category = classify(d.id(), mm);
                // 音频/向量等无对应窗口形态，直接剔除；chat/image/video 保留并带上分类供前端按模式筛选。
                if ("other".equals(category)) {
                    continue;
                }
                boolean multimodal = pricingOk ? mm.tags().contains("多模态") : isMultimodal(d.id());
                models.add(enrich(d.id(), mm, multimodal, category, pricingOk));
            }
            cachedModels = List.copyOf(models);
            cacheExpireAt = now + Duration.ofSeconds(props.getModelsCacheTtlSeconds()).toMillis();
            return cachedModels;
        } catch (RuntimeException e) {
            log.warn("[ai-chat] 拉取 4sapi /models 失败，回退静态清单: {}", e.toString());
            return null;
        }
    }

    /** 用 pricing 元数据构建 ModelInfo；multimodal 与 category 由调用方算好传入,温度支持据 pricing 标签判定。 */
    private ModelInfo enrich(String id, ModelMeta meta, boolean multimodal, String category, boolean pricingOk) {
        return new ModelInfo(id, label(id), multimodal, resolveSupportsTemperature(id, meta, pricingOk),
                meta.tags(), meta.description(), meta.priceRatio(), category);
    }

    /** 拉网关 /api/pricing 富化能力信息（公开端点）。失败返回空表，调用方自动回退名称推断。 */
    private Map<String, ModelMeta> fetchPricing() {
        try {
            PricingResponse resp = rest.get()
                    .uri(pricingUrl())
                    .header("Authorization", "Bearer " + gateway.getApiKey())
                    .retrieve()
                    .body(PricingResponse.class);
            if (resp == null || resp.data() == null) {
                return Map.of();
            }
            Map<String, ModelMeta> map = new HashMap<>(resp.data().size());
            for (PricingEntry e : resp.data()) {
                if (e.model_name() == null || e.model_name().isBlank()) {
                    continue;
                }
                map.put(e.model_name(), new ModelMeta(splitTags(e.tags()), blankToNull(e.description()),
                        e.model_ratio(), e.supported_endpoint_types() == null ? List.of() : e.supported_endpoint_types()));
            }
            return map;
        } catch (RuntimeException e) {
            log.warn("[ai-chat] 拉取 4sapi /api/pricing 失败，能力信息退化为名称推断: {}", e.toString());
            return Map.of();
        }
    }

    /** 由 base-url 推导 pricing 端点：去掉末尾 /v1，拼 /api/pricing。 */
    private String pricingUrl() {
        String base = gateway.getBaseUrl();
        String origin = base.endsWith("/v1") ? base.substring(0, base.length() - 3)
                : base.endsWith("/v1/") ? base.substring(0, base.length() - 4) : base;
        if (origin.endsWith("/")) {
            origin = origin.substring(0, origin.length() - 1);
        }
        return origin + "/api/pricing";
    }

    private static List<String> splitTags(String tags) {
        if (tags == null || tags.isBlank()) {
            return List.of();
        }
        return Arrays.stream(tags.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    private String label(String id) {
        return props.getModelLabels().getOrDefault(id, id);
    }

    @EventListener(EnvironmentChangeEvent.class)
    public void onConfigChange(EnvironmentChangeEvent event) {
        boolean affected = event.getKeys().stream().anyMatch(k -> k.startsWith("toolbox.ai-chat") || k.startsWith("toolbox.llm.gateway"));
        if (affected) {
            cachedModels = null;
            cacheExpireAt = 0;
            log.info("[ai-chat] 配置变更，模型缓存已清");
        }
    }
}
