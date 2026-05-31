package com.exceptioncoder.toolbox.treesize.api.dto;

/**
 * POST /api/treesize/videos/merge 出参。
 *
 * <ul>
 *   <li>{@code outputPath} —— 合并输出文件绝对路径</li>
 *   <li>{@code inputCount} —— 请求传入的路径数</li>
 *   <li>{@code mergedCount} —— 实际参与合并的有效输入数</li>
 *   <li>{@code skippedCount} —— 被剔除的无效输入数（不存在 / 无视频流 / probe 失败）</li>
 *   <li>{@code outputBytes} —— 输出文件字节数</li>
 *   <li>{@code reencoded} —— true=走了重编码；false=copy 无损拼接</li>
 *   <li>{@code elapsedMs} —— 合并耗时，毫秒</li>
 * </ul>
 */
public record VideoMergeResult(
        String outputPath,
        int inputCount,
        int mergedCount,
        int skippedCount,
        long outputBytes,
        boolean reencoded,
        long elapsedMs
) {}
