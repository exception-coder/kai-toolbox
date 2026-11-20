package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 可选模型信息，对应 SDK 的 ModelInfo（仅取前端需要的字段）。
 * value 用于 setModel；displayName/description 供菜单展示。
 * speedTiers 为 Codex 目录声明的非标准速度档位，null 表示目录未声明。
 */
public record ModelInfo(String value, String displayName, String description,
                        java.util.List<String> reasoningEfforts,
                        String defaultReasoningEffort,
                        Boolean fastSupported,
                        boolean isDefault,
                        Boolean supportsEffort,
                        java.util.List<String> supportedEffortLevels,
                        String resolvedModel,
                        java.util.List<SpeedTier> speedTiers) {
    /** value 沿用 Forge 速度值：fast 对应 Codex priority，其余为 Codex service tier id。 */
    public record SpeedTier(String value, String label, String description) {}

    public ModelInfo(String value, String displayName, String description,
                     java.util.List<String> reasoningEfforts, String defaultReasoningEffort,
                     Boolean fastSupported, boolean isDefault, Boolean supportsEffort,
                     java.util.List<String> supportedEffortLevels, String resolvedModel) {
        this(value, displayName, description, reasoningEfforts, defaultReasoningEffort, fastSupported,
                isDefault, supportsEffort, supportedEffortLevels, resolvedModel, null);
    }

    public ModelInfo(String value, String displayName, String description,
                     java.util.List<String> reasoningEfforts, String defaultReasoningEffort,
                     boolean fastSupported, boolean isDefault) {
        this(value, displayName, description, reasoningEfforts, defaultReasoningEffort,
                fastSupported, isDefault, null, java.util.List.of(), null, null);
    }
}
