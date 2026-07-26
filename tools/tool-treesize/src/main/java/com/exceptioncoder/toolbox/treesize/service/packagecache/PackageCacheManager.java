package com.exceptioncoder.toolbox.treesize.service.packagecache;

/**
 * 单个包管理器的原生缓存配置策略。
 */
public interface PackageCacheManager {

    String id();

    Status status();

    Status configure(String targetPath);

    record Status(
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
    }
}
