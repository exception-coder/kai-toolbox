package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ModelInfo;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Codex 速度档位。Forge 沿用历史值：default=标准，fast=Codex 的 priority 档；
 * 其余档位直接使用 Codex 目录中的 service tier id，与 sidecar 的 codexSpeedTiers 保持一致。
 */
final class CodexSpeedTiers {
    private static final Pattern TIER_ID = Pattern.compile("[a-z][a-z0-9_-]{0,31}");

    private CodexSpeedTiers() {
    }

    static String normalize(String speed) {
        if ("fast".equals(speed) || "priority".equals(speed)) return "fast";
        return speed != null && !"default".equals(speed) && TIER_ID.matcher(speed).matches() ? speed : "default";
    }

    /** 优先读取 service_tiers；旧版缓存只有 additional_speed_tiers 时按 id 兜底。 */
    static List<ModelInfo.SpeedTier> fromCatalog(JsonNode serviceTiers, JsonNode legacyTiers) {
        Map<String, ModelInfo.SpeedTier> tiers = new LinkedHashMap<>();
        if (serviceTiers != null && serviceTiers.isArray()) {
            for (JsonNode tier : serviceTiers) {
                String id = tier.path("id").asText("");
                if ("default".equals(id) || !TIER_ID.matcher(id).matches()) continue;
                String name = tier.path("name").asText("").trim();
                tiers.putIfAbsent(normalize(id), new ModelInfo.SpeedTier(normalize(id),
                        name.isEmpty() ? id : name, tier.path("description").asText("")));
            }
        }
        if (tiers.isEmpty() && legacyTiers != null && legacyTiers.isArray()) {
            for (JsonNode tier : legacyTiers) {
                String id = tier.asText("");
                if ("default".equals(id) || !TIER_ID.matcher(id).matches()) continue;
                tiers.putIfAbsent(normalize(id), new ModelInfo.SpeedTier(normalize(id), id, ""));
            }
        }
        return List.copyOf(tiers.values());
    }

    /** 解析 sidecar 已规范化的 speedTiers；缺失返回 null，表示目录未声明。 */
    static List<ModelInfo.SpeedTier> fromSidecar(JsonNode speedTiers) {
        if (speedTiers == null || !speedTiers.isArray()) return null;
        List<ModelInfo.SpeedTier> tiers = new ArrayList<>();
        for (JsonNode tier : speedTiers) {
            String value = normalize(tier.path("value").asText(""));
            if ("default".equals(value) || tiers.stream().anyMatch(item -> item.value().equals(value))) continue;
            tiers.add(new ModelInfo.SpeedTier(value, tier.path("label").asText(value), tier.path("description").asText("")));
        }
        return List.copyOf(tiers);
    }
}
