package com.exceptioncoder.toolbox.treesize.domain;

import java.util.Locale;

/**
 * 字幕生成前对源视频音频做的轻量分析结果。
 *
 * <p>由 {@code AudioContentProbe} 通过 ffmpeg 的 {@code volumedetect + silencedetect} 滤镜
 * 在源视频的中段采样得到，用于在跑 whisper 之前判断这段音频「是否值得跑」—— 提前淘汰
 * 纯静默 / 无音轨 / 老旧编码解出空音轨的情况，避免用户白等几分钟 GPU 时间。
 *
 * @param hasAudioStream     是否存在音频流（从 ffprobe 探测得到）
 * @param durationSeconds    源视频总时长（秒）
 * @param sampleSeconds      实际采样的秒数（通常 60，可能因短视频被截短）
 * @param meanVolumeDb       采样段平均音量（dB，越接近 0 越响）；无音轨时为 0
 * @param maxVolumeDb        采样段峰值音量（dB）；无音轨时为 0
 * @param silenceRatio       采样段中静默时长占比 [0, 1]
 * @param verdict            综合评级
 * @param reason             给用户看的中文解释，会被写入 errorMsg / SSE analysis 事件
 */
public record AudioAnalysis(
        boolean hasAudioStream,
        double durationSeconds,
        double sampleSeconds,
        double meanVolumeDb,
        double maxVolumeDb,
        double silenceRatio,
        Verdict verdict,
        String reason
) {
    /** 评级。LIKELY_OK 继续跑；SPARSE 警告但继续；其余直接 FAILED。 */
    public enum Verdict {
        /** 音频充足，几乎肯定能转写出有效字幕。 */
        LIKELY_OK,
        /** 大段静默或音量很低，字幕可能稀疏 / 不完整，但允许用户尝试。 */
        SPARSE,
        /** 几乎全静默或音量过低，跑 whisper 大概率拿不到任何 segment。 */
        UNLIKELY,
        /** 视频本身没有音频流（纯监控画面、纯图像幻灯片等）。 */
        NO_AUDIO_STREAM,
        /** ffmpeg 解码失败 / 探测超时；具体原因看 reason。 */
        DECODE_FAILED
    }

    /** 一行人话摘要，写入 errorMsg / 日志便于排查。 */
    public String summary() {
        if (verdict == Verdict.NO_AUDIO_STREAM) return reason;
        if (verdict == Verdict.DECODE_FAILED) return reason;
        return String.format(Locale.ROOT,
                "%s（采样 %.0fs，峰值 %.1f dB，平均 %.1f dB，静默占比 %.0f%%）",
                reason, sampleSeconds, maxVolumeDb, meanVolumeDb, silenceRatio * 100);
    }
}
