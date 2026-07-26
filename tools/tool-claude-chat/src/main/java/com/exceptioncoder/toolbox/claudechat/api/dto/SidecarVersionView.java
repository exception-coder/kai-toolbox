package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * sidecar 所用 Claude Agent SDK 的版本自检结果。
 *
 * @param declared       package.json 里声明的版本范围
 * @param installed      node_modules 里实际装着的版本（运行期真正生效的那个）
 * @param cliVersion     该 SDK 捆绑的 claude 二进制版本；取不到为 null
 * @param latest         npm 上的最新版本；仅在显式检查时才有，否则 null
 * @param outdated       installed 落后于 latest；未检查或无法比较时 false
 * @param upgradeCommand 升级命令原文，供前端一键复制
 * @param error          自检失败原因；成功为 null
 */
public record SidecarVersionView(
        String declared,
        String installed,
        String cliVersion,
        String latest,
        boolean outdated,
        String upgradeCommand,
        String error
) {
    public static SidecarVersionView error(String message) {
        return new SidecarVersionView(null, null, null, null, false, null, message);
    }
}
