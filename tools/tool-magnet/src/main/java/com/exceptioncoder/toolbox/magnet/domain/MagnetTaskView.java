package com.exceptioncoder.toolbox.magnet.domain;

import java.util.List;

/**
 * 任务视图。从 aria2 tellStatus 响应裁出前端关心的字段。
 *
 * @param resolvedByCache 该任务的 .torrent 是否由缓存解析器提供（true = 跳过 metadata 阶段，
 *                        false = 走原生 DHT；信息只在创建时可知，列表查询时统一回 false）
 */
public record MagnetTaskView(
        String gid,
        String state,                // QUEUED/ACTIVE/PAUSED/COMPLETED/FAILED/REMOVED
        String displayName,
        long totalLength,
        long completedLength,
        long uploadLength,
        long downloadSpeedBps,
        long uploadSpeedBps,
        int numSeeders,
        int numConnections,
        Integer errorCode,
        String errorMessage,
        List<String> files,
        String infoHash,
        String savePath,
        boolean resolvedByCache
) {
}
