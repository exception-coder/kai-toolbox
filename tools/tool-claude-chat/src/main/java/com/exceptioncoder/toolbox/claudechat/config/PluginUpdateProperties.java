package com.exceptioncoder.toolbox.claudechat.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * team-standards 插件「版本检测 + 一键更新」配置。命令固定可配,不接受用户自定义(无注入面)。
 */
@Data
@Component
@ConfigurationProperties(prefix = "toolbox.claude-chat.plugin-update")
public class PluginUpdateProperties {

    /** 是否启用插件更新能力 */
    private boolean enabled = true;

    /** 市场名称(Claude marketplace 名 / Codex marketplace 名,约定一致) */
    private String marketplace = "team-standards";

    /** 插件名(marketplace 内的 plugin id) */
    private String pluginName = "team-standards";

    /** Claude CLI 可执行(在 PATH 上即可;Windows 经 cmd /c 调用) */
    private String claudeBin = "claude";

    /**
     * Codex CLI 调用命令(空白则由 ClaudeChatProperties 的 nodeCommand + sidecarDir
     * 推导为 `node <sidecarDir>/node_modules/@openai/codex/bin/codex.js`)。
     * 多段以空格分隔,如 `node D:/.../codex.js`。
     */
    private String codexCmd = "";

    /** 单条命令超时(毫秒) */
    private long commandTimeoutMs = 180_000L;
}
