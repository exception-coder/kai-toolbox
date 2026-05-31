package com.exceptioncoder.toolbox.treesize.domain;

/**
 * video_processing_job 行的不可变映射。所有 long 计数器都用 long 不用 int，避免百万级视频
 * 库的 processed/total 溢出（虽然 int 也够，但 long 更省心）。
 * <p>{@code currentPath} 在 RUNNING 期间实时刷新，前端用于"当前处理：xxx.mp4"展示；
 * 终止后保留最后一个值。{@code errorMsg} 仅保存最近一次失败的错误（不累计），防止
 * 列宽爆炸；用户拿这个做问题定位。
 */
public record ProcessingJob(
        String id,
        ProcessingJobType type,
        ProcessingJobStatus status,
        long total,
        long processed,
        long succeeded,
        long failed,
        String currentPath,
        String errorMsg,
        long startedAt,
        Long finishedAt
) {}
