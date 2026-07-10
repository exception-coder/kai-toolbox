package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 可选模型信息，对应 SDK 的 ModelInfo（仅取前端需要的字段）。
 * value 用于 setModel；displayName/description 供菜单展示。
 */
public record ModelInfo(String value, String displayName, String description,
                        java.util.List<String> reasoningEfforts,
                        String defaultReasoningEffort,
                        boolean fastSupported) {}
