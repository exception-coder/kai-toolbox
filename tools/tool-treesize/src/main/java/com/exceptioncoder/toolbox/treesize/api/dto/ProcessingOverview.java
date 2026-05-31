package com.exceptioncoder.toolbox.treesize.api.dto;

/**
 * GET /api/treesize/videos/processing-overview 出参：各处理任务在<b>整个视频表</b>上的累计进度。
 *
 * <p>{@code total} = 视频总数；各 {@code *Done} = 已处理数（含成功 + 已尝试失败，即已"出队"的行）。
 * 前端进度按钮用它显示「已完成 / 总数」，这样每次进入页面都能看到持久化的累计进度，
 * 而不是只显示某一次 job 的本轮计数（从 0 开始）。
 */
public record ProcessingOverview(
        long total,
        long durationDone,
        long nameGroupingDone,
        long languageDone,
        long gridDone
) {}
