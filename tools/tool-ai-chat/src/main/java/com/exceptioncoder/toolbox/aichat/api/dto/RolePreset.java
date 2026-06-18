package com.exceptioncoder.toolbox.aichat.api.dto;

/**
 * 角色预设：选中即把 systemPrompt 填入新会话。
 *
 * @param id           预设标识
 * @param label        展示名
 * @param systemPrompt 对应的系统提示词
 */
public record RolePreset(String id, String label, String systemPrompt) {
}
