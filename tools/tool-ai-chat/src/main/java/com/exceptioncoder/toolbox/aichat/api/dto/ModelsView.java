package com.exceptioncoder.toolbox.aichat.api.dto;

import java.util.List;

/**
 * GET /models 响应。
 *
 * @param models  可用模型清单
 * @param presets 角色预设清单
 * @param source  "remote"=取自 4sapi /v1/models；"fallback"=4sapi 失败回退静态配置
 */
public record ModelsView(List<ModelInfo> models, List<RolePreset> presets, String source) {
}
