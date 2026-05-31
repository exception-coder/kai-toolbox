package com.exceptioncoder.toolbox.ffmpeglab.api.dto;

import com.exceptioncoder.toolbox.ffmpeglab.domain.RunResult;

import java.util.List;

/**
 * 运行结果视图：诊断字段 + 前端播放所需的 playUrl / playKind。
 *
 * @param runId       运行 id
 * @param mode        模式枚举名
 * @param streaming   是否流式模式（诊断字段稍后经 /runs/recent 回填）
 * @param success     是否成功
 * @param exitCode    ffmpeg 退出码
 * @param command     实跑命令
 * @param firstByteMs 流式首字节耗时（临时文件类为 null）
 * @param totalMs     临时文件类总耗时
 * @param outputBytes 产物字节数
 * @param stderrTail  ffmpeg stderr 尾部
 * @param playUrl     播放地址
 * @param playKind    投递类型（native / hls / mjpeg）
 */
public record RunResultView(
        String runId,
        String mode,
        boolean streaming,
        boolean success,
        int exitCode,
        String command,
        Long firstByteMs,
        Long totalMs,
        long outputBytes,
        List<String> stderrTail,
        String playUrl,
        String playKind
) {
    public static RunResultView from(RunResult r, String playUrl, String playKind) {
        return new RunResultView(
                r.runId(), r.mode().name(), r.streaming(), r.success(), r.exitCode(),
                r.command(), r.firstByteMs(), r.totalMs(), r.outputBytes(), r.stderrTail(),
                playUrl, playKind);
    }
}
