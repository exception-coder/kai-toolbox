package com.exceptioncoder.toolbox.ffmpeglab.domain;

import java.util.List;

/**
 * 单次运行某模式的诊断记录，存入 {@code RunDiagnosticsCollector} 的内存环。
 *
 * @param runId        运行 id，play 端点用它定位 workDir 物料
 * @param mode         模式
 * @param streaming    是否流式模式（MJPEG）
 * @param success      ffmpeg 退出码为 0 且产物有效
 * @param exitCode     ffmpeg 退出码；流式被客户端中断时为 -1
 * @param command      实跑的 ffmpeg 命令（与探测预览逐字一致）
 * @param firstByteMs  流式模式首字节耗时；临时文件类为 null
 * @param totalMs      临时文件类总转码耗时；流式为整段流时长
 * @param outputBytes  产物字节数
 * @param stderrTail   ffmpeg stderr 尾部若干行
 * @param timestamp    记录时刻（epoch ms）
 */
public record RunResult(
        String runId,
        TranscodeMode mode,
        boolean streaming,
        boolean success,
        int exitCode,
        String command,
        Long firstByteMs,
        Long totalMs,
        long outputBytes,
        List<String> stderrTail,
        long timestamp
) {
}
