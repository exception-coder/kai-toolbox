package com.exceptioncoder.toolbox.ffmpeglab.api.dto;

/**
 * 单个模式在探测阶段的展示信息。
 *
 * @param mode             模式枚举名（REMUX_COPY / PROGRESSIVE_MP4 / HLS_TS / HLS_FMP4 / MJPEG）
 * @param label            展示名
 * @param playKind         投递类型（native / hls / mjpeg）
 * @param prediction       预判（OK / TRANSCODE / FAIL）
 * @param predictionReason 预判理由
 * @param command          将执行的 ffmpeg 命令（与实跑一致）
 */
public record ModeView(
        String mode,
        String label,
        String playKind,
        String prediction,
        String predictionReason,
        String command
) {
}
