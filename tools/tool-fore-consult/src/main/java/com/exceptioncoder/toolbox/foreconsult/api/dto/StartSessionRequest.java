package com.exceptioncoder.toolbox.foreconsult.api.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

/**
 * 启动业务系统咨询会话的请求体。
 *
 * @param systemName       所选系统名（来自 claude-chat workspaces）
 * @param systemSourcePath 所选系统源码路径（作为悬浮会话 cwd 的快照）
 * @param moduleNames      所选模块名列表（可选，服务层序列化为 JSON 存库）
 * @param promptSnapshot   变量替换后的约束提示词快照（可选，用于追溯）
 * @param userId           发起咨询的用户（可选）
 * @param role             回答对象角色：{@code IT}（IT 客服）| {@code BIZ}（业务员），null 时按 IT 兜底
 */
public record StartSessionRequest(
        @NotBlank String systemName,
        @NotBlank String systemSourcePath,
        List<String> moduleNames,
        String promptSnapshot,
        String userId,
        String role
) {
}
