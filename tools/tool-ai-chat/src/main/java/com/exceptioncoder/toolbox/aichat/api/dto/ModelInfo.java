package com.exceptioncoder.toolbox.aichat.api.dto;

/**
 * 一个可选模型。
 *
 * @param id                 传给 4sapi 的模型名（取自 /v1/models）
 * @param label              UI 展示名，默认等于 id
 * @param multimodal         是否支持图片输入（按配置的名称模式推断）
 * @param supportsTemperature 是否支持自定义温度（推理模型为 false，不下发 temperature）
 */
public record ModelInfo(String id, String label, boolean multimodal, boolean supportsTemperature) {
}
