package com.exceptioncoder.toolbox.downloader.domain;

/**
 * 下载任务状态机。状态切换统一经由 DownloaderTaskService#transitionTo，其他类禁止直接 UPDATE。
 */
public enum TaskState {

    QUEUED,
    PROBING,
    DOWNLOADING,
    PAUSED,
    COMPLETED,
    FAILED;

    public boolean isTerminal() {
        return this == COMPLETED || this == FAILED;
    }

    public boolean isActive() {
        return this == PROBING || this == DOWNLOADING;
    }
}
