package com.exceptioncoder.toolbox.aichat.api.dto;

import java.util.List;

/**
 * 一个可选模型。能力信息优先取自网关 /api/pricing（真实标签/介绍/定价），缺失时回退按名称推断。
 *
 * @param id                 传给 4sapi 的模型名（取自 /v1/models）
 * @param label              UI 展示名，默认等于 id
 * @param multimodal         是否支持图片输入（pricing 标签「多模态」优先，否则按名称模式推断）
 * @param supportsTemperature 是否支持自定义温度（推理模型为 false，不下发 temperature）
 * @param tags               能力标签（取自 pricing tags，如 推理/工具/文件/多模态/200K）；无则空列表
 * @param description        模型介绍（取自 pricing description）；无则 null
 * @param priceRatio         价格倍率（pricing model_ratio，作能力/成本代理用于排序）；无则 0
 * @param category           能力分类：chat（对话）/ image（绘图）/ video（视频），供前端按模式筛选
 */
public record ModelInfo(String id, String label, boolean multimodal, boolean supportsTemperature,
                        List<String> tags, String description, double priceRatio, String category) {
}
