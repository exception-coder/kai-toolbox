package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/**
 * 嵌入式业务助手当前生效的非敏感配置投影。
 *
 * @param externalLoginEnabled 外部宿主登录是否启用
 * @param externalLoginAllowedOrigins 外部登录与附件、归档接口允许的完整 Origin
 * @param consultAllowedOriginPatterns 咨询 WebSocket 允许的 Origin pattern
 * @param externalLoginConfigured 外部登录开关与白名单是否同时就绪
 * @param websocketOriginsRestricted WebSocket Origin 是否已从通配符收紧
 * @param loaderPath 稳定 Loader 的服务端路径
 * @param externalLoginPath 外部登录接口路径
 * @param consultWebSocketPath 咨询 WebSocket 路径
 * @param projectBindingsPath 项目绑定查询接口路径
 */
public record AssistantIntegrationStatusView(
        boolean externalLoginEnabled,
        List<String> externalLoginAllowedOrigins,
        List<String> consultAllowedOriginPatterns,
        boolean externalLoginConfigured,
        boolean websocketOriginsRestricted,
        String loaderPath,
        String externalLoginPath,
        String consultWebSocketPath,
        String projectBindingsPath
) {
}
