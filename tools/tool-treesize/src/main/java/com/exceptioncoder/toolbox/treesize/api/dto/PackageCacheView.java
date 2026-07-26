package com.exceptioncoder.toolbox.treesize.api.dto;

import com.exceptioncoder.toolbox.treesize.service.packagecache.PackageCacheManager;

/**
 * 包管理器缓存位置及最近一次配置结果。
 */
public record PackageCacheView(
        String managerId,
        String displayName,
        String currentPath,
        String defaultPath,
        String configPath,
        boolean migrationSupported,
        String previousPath,
        String backupPath,
        String configurationMethod,
        String configurationKey,
        String verificationCommand,
        String cleanupHint,
        String message
) {
    /**
     * 将应用服务结果转换为接口视图。
     *
     * @param status 缓存配置状态
     * @return 接口视图
     */
    public static PackageCacheView from(PackageCacheManager.Status status) {
        return new PackageCacheView(
                status.managerId(),
                status.displayName(),
                status.currentPath(),
                status.defaultPath(),
                status.configPath(),
                status.migrationSupported(),
                status.previousPath(),
                status.backupPath(),
                status.configurationMethod(),
                status.configurationKey(),
                status.verificationCommand(),
                status.cleanupHint(),
                status.message());
    }
}
