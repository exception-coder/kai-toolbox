package com.exceptioncoder.toolbox.vscodetunnel.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 绑定 application.yml 中的 toolbox.vscode-tunnel.* 配置。
 * 由顶层 ToolboxApplication 上的 @ConfigurationPropertiesScan 自动注册。
 */
@ConfigurationProperties(prefix = "toolbox.vscode-tunnel")
public record VsCodeTunnelProperties(
        boolean enabled,
        String codePath,
        String tunnelName,
        boolean acceptLicense,
        long stopGraceMs,
        int errorTailBytes
) {
    public VsCodeTunnelProperties {
        if (codePath == null || codePath.isBlank()) codePath = "code";
        if (tunnelName == null || tunnelName.isBlank()) tunnelName = defaultTunnelName();
        if (stopGraceMs <= 0) stopGraceMs = 5000L;
        if (errorTailBytes <= 0) errorTailBytes = 1024;
    }

    private static String defaultTunnelName() {
        String name = System.getenv("COMPUTERNAME"); // Windows
        if (name == null || name.isBlank()) name = System.getenv("HOSTNAME"); // *nix
        if (name == null || name.isBlank()) name = "kai-pc";
        return name.toLowerCase().replaceAll("[^a-z0-9-]", "-");
    }
}
