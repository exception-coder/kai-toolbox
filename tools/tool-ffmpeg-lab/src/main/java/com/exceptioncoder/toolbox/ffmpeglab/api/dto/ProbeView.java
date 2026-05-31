package com.exceptioncoder.toolbox.ffmpeglab.api.dto;

import java.util.List;

/**
 * 探测结果 + 每模式预判与命令预览。
 *
 * @param ffmpegAvailable ffmpeg 是否可用（false 时运行端点返回 503）
 * @param probe           ffprobe 元数据
 * @param modes           5 种模式各自的预判 + 将执行的命令
 */
public record ProbeView(
        boolean ffmpegAvailable,
        ProbeInfo probe,
        List<ModeView> modes
) {
    /**
     * @param container        容器（ffprobe format_name 原值）
     * @param videoCodec       视频编码
     * @param audioCodec       音频编码，无音轨为 "(none)"
     * @param durationSeconds  时长（秒）
     * @param nativelyPlayable 浏览器能否直接原生播放原文件
     */
    public record ProbeInfo(
            String container,
            String videoCodec,
            String audioCodec,
            double durationSeconds,
            boolean nativelyPlayable
    ) {
    }
}
