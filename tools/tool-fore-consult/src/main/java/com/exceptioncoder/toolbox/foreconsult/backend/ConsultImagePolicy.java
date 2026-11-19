package com.exceptioncoder.toolbox.foreconsult.backend;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Storage budgets are independent of the per-request image limits. Values take effect on startup. */
@Component
public record ConsultImagePolicy(
        @Value("${toolbox.fore-consult.backend.images.app-bytes:268435456}") long appBytes,
        @Value("${toolbox.fore-consult.backend.images.global-bytes:1073741824}") long globalBytes,
        @Value("${toolbox.fore-consult.backend.images.app-count:2000}") int appCount,
        @Value("${toolbox.fore-consult.backend.images.global-count:10000}") int globalCount,
        @Value("${toolbox.fore-consult.backend.images.app-metadata-count:2000}") int appMetadataCount,
        @Value("${toolbox.fore-consult.backend.images.global-metadata-count:10000}") int globalMetadataCount,
        @Value("${toolbox.fore-consult.backend.images.task-retention-hours:48}") int taskRetentionHours,
        @Value("${toolbox.fore-consult.backend.images.max-lifetime-days:7}") int maxLifetimeDays) {
    public ConsultImagePolicy {
        if (appBytes < 1 || globalBytes < appBytes || appCount < 1 || globalCount < appCount
                || appMetadataCount < 1 || globalMetadataCount < appMetadataCount
                || taskRetentionHours < 1 || taskRetentionHours > 168 || maxLifetimeDays < 2
                || maxLifetimeDays > 30 || maxLifetimeDays * 24 <= taskRetentionHours) {
            throw new IllegalArgumentException("图片配额或保留窗口无效：全局须不小于应用，任务窗口须小于最大生命周期");
        }
    }

    public static ConsultImagePolicy defaults() {
        return new ConsultImagePolicy(256L * 1024 * 1024, 1024L * 1024 * 1024, 2000, 10000, 2000, 10000, 48, 7);
    }
}
