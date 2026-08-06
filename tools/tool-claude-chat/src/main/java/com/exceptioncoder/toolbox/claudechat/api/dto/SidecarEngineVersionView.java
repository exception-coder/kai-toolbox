package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * sidecar 中单个对话引擎运行包的版本状态。
 *
 * @param id          引擎标识
 * @param name        展示名称
 * @param packageName npm 包名
 * @param declared    package.json 声明版本
 * @param installed   node_modules 实际版本
 * @param cliVersion  随运行包捆绑且可确认的 CLI 版本
 * @param latest      npm 最新版本，仅显式检查时返回
 * @param outdated    实际版本是否落后
 * @param error       该引擎的本地检测失败原因
 */
public record SidecarEngineVersionView(
        String id,
        String name,
        String packageName,
        String declared,
        String installed,
        String cliVersion,
        String latest,
        boolean outdated,
        String error
) {
}
