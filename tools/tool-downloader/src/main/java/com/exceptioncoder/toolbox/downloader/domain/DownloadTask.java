package com.exceptioncoder.toolbox.downloader.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * 任务实体。直接对应 tool_downloader_task 表。
 * 非线程安全；并发更新通过 DownloaderTaskService 单一入口 + 行级锁串行化。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DownloadTask {

    private Long id;
    private String url;
    private String savePath;
    private String filename;
    private long totalSize;             // -1 = 未知
    private boolean acceptRanges;
    private TaskState state;
    private RouteType routeType;        // 可空
    private String routeProxy;          // 可空，route=PROXY 时填代理 URL
    private Long probeDirectTtfbMs;
    private Long probeDirectBps;
    private Long probeProxyTtfbMs;
    private Long probeProxyBps;
    private String lastError;
    private HttpEngineType httpEngine;       // 任务级 HTTP 引擎选择，默认 JDK
    private Instant createdAt;
    private Instant updatedAt;
}
