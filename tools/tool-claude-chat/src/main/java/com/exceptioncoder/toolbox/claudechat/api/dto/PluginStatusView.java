package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * team-standards 插件双端版本视图。
 *
 * @param marketplace 市场名
 * @param claude      Claude 端版本信息
 * @param codex       Codex 端版本信息
 */
public record PluginStatusView(String marketplace, EngineStatus claude, EngineStatus codex) {

    /**
     * 单端版本。
     *
     * @param installed 已装版本(取不到为 null)
     * @param available 市场可用版本(尽力而为,取不到为 null)
     * @param error     检测失败原因(成功为 null)
     */
    public record EngineStatus(String installed, String available, String error) {
        public static EngineStatus of(String installed, String available) {
            return new EngineStatus(installed, available, null);
        }

        public static EngineStatus error(String error) {
            return new EngineStatus(null, null, error);
        }
    }
}
