package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.common.media.FfmpegProbe;
import com.exceptioncoder.toolbox.common.media.FfmpegProcessRegistry;
import com.exceptioncoder.toolbox.common.media.FfmpegProperties;
import com.exceptioncoder.toolbox.common.media.ProbeResult;
import com.exceptioncoder.toolbox.treesize.domain.AudioAnalysis;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.function.IntConsumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 字幕生成前的音频内容预检。在 SubtitleService 启动 whisper 之前调用，提前拒绝
 * 「跑了也没字幕」的输入，避免占用 GPU 时间。
 *
 * <p>实现方式：先用 {@link FfmpegProbe} 拿到容器级信息（是否有音频流、时长），再对
 * <b>整个音频</b>跑 ffmpeg 的 {@code volumedetect + silencedetect} 链式滤镜，从 stderr
 * 解出峰值音量 / 平均音量 / 累计静默时长。<b>不采样</b>——长视频（电影 / 纪录片）对话
 * 稀疏分布，任何采样策略都有概率正好落到全静默段被误判为 UNLIKELY，全文件解码才能
 * 给出和 whisper 处理范围一致的判定。
 *
 * <p>速度参考：ffmpeg 只解音频（{@code -vn} + null muxer）的吞吐量是实时的 50-100 倍，
 * 1 小时音频 ≈ 30-60 秒，3 小时电影 ≈ 2-3 分钟。相对 whisper 实跑的 5-30 分钟可忽略。
 * 解析 stderr 里的 {@code time=HH:MM:SS.mm} 行实时报进度给 SSE，长视频用户看得到。
 *
 * <p>判定阈值（按长视频经验校准，比单点采样宽松得多）：
 * <ul>
 *   <li>无音频流 → {@code NO_AUDIO_STREAM}</li>
 *   <li>峰值 &lt; -50 dB 或 静默占比 &gt; 99% → {@code UNLIKELY}（基本全无声）</li>
 *   <li>静默占比 &gt; 90% → {@code SPARSE}（电影 / 纪录片常见 70-85% 静默仍正常）</li>
 *   <li>其余 → {@code LIKELY_OK}</li>
 * </ul>
 */
@Component
public class AudioContentProbe {

    private static final Logger log = LoggerFactory.getLogger(AudioContentProbe.class);

    /** silencedetect 的噪声阈值（dB）。低于此电平视为静默。 */
    private static final double SILENCE_NOISE_DB = -35.0;
    /** silencedetect 的最短静默时长（秒）；过短的间隔不计入累计。 */
    private static final double SILENCE_MIN_DURATION = 0.5;
    /** 整个 ffmpeg 预检的硬超时。3 小时电影约 2-3 分钟，给 10 分钟兜底坏文件。 */
    private static final long PROBE_TIMEOUT_SECONDS = 600;

    private static final Pattern MEAN_VOLUME_RE =
            Pattern.compile("mean_volume:\\s*(-?\\d+(?:\\.\\d+)?)\\s*dB");
    private static final Pattern MAX_VOLUME_RE =
            Pattern.compile("max_volume:\\s*(-?\\d+(?:\\.\\d+)?)\\s*dB");
    private static final Pattern SILENCE_DURATION_RE =
            Pattern.compile("silence_duration:\\s*(\\d+(?:\\.\\d+)?)");
    /** ffmpeg 周期性输出的进度行：{@code time=00:12:34.56}，用来折算百分比。 */
    private static final Pattern TIME_PROGRESS_RE =
            Pattern.compile("time=(\\d+):(\\d+):(\\d+(?:\\.\\d+)?)");

    private final FfmpegProperties props;
    private final FfmpegProbe probe;
    private final FfmpegProcessRegistry registry;

    public AudioContentProbe(FfmpegProperties props, FfmpegProbe probe, FfmpegProcessRegistry registry) {
        this.props = props;
        this.probe = probe;
        this.registry = registry;
    }

    /**
     * 对 {@code video} 做一次<b>全文件</b>预检并返回评级。<b>不抛业务异常</b> —— 解码本身
     * 失败也只是返回 {@link AudioAnalysis.Verdict#DECODE_FAILED}，由调用方决定怎么处理。
     *
     * @param progressCallback 0-100 的百分比进度回调，长视频通过它把分析进度推给 SSE；
     *                         {@code null} 表示不需要进度通知
     */
    public AudioAnalysis analyze(Path video, IntConsumer progressCallback) {
        // 第一步：容器级探测（音频流 + 时长）。复用 FfmpegProbe 的缓存。
        ProbeResult info;
        try {
            info = probe.probe(video);
        } catch (IOException e) {
            return new AudioAnalysis(false, 0, 0, 0, 0, 0,
                    AudioAnalysis.Verdict.DECODE_FAILED,
                    "ffprobe 探测失败：" + e.getMessage());
        }
        if (info == ProbeResult.UNKNOWN || info.audioCodec() == null
                || "(none)".equalsIgnoreCase(info.audioCodec())) {
            return new AudioAnalysis(false, info.durationSeconds(), 0, 0, 0, 0,
                    AudioAnalysis.Verdict.NO_AUDIO_STREAM,
                    "视频中没有可识别的音频流（codec=" + (info.audioCodec() == null ? "?" : info.audioCodec()) + "）");
        }

        double duration = info.durationSeconds();

        // 第二步：全文件解码音频，跑 volumedetect + silencedetect。
        SampleStats stats;
        try {
            stats = runFullAnalysis(video, duration, progressCallback);
        } catch (Exception e) {
            log.warn("音频预检 ffmpeg 解码失败 file={}: {}", video, e.toString());
            return new AudioAnalysis(true, duration, 0, 0, 0, 0,
                    AudioAnalysis.Verdict.DECODE_FAILED,
                    "ffmpeg 解码失败（源音频编码可能不被完整支持）：" + e.getMessage());
        }

        // 静默占比 = 累计静默时长 / 总时长。注意：silencedetect 只输出大于 SILENCE_MIN_DURATION
        // 的连续静默段，零碎的短暂停顿不计入，所以这个比例偏向「真实长静默」。
        double silenceRatio = duration > 0 ? Math.min(1.0, stats.totalSilenceSeconds / duration) : 1.0;
        AudioAnalysis.Verdict verdict;
        String reason;
        // 阈值按长视频校准过：电影 / 纪录片 70-85% 静默是常态（场景间转场 + 配乐段），
        // 只有真正接近全无声的视频才被判定为 UNLIKELY 提前止损。
        if (stats.maxVolumeDb < -50 || silenceRatio > 0.99) {
            verdict = AudioAnalysis.Verdict.UNLIKELY;
            reason = "音轨几乎全静默或音量过低，跑 whisper 大概率没有字幕";
        } else if (silenceRatio > 0.90) {
            verdict = AudioAnalysis.Verdict.SPARSE;
            reason = "音轨有效语音很少，字幕将只覆盖少量片段";
        } else {
            verdict = AudioAnalysis.Verdict.LIKELY_OK;
            reason = "音轨音量正常";
        }

        AudioAnalysis result = new AudioAnalysis(
                true, duration, duration,
                stats.meanVolumeDb, stats.maxVolumeDb, silenceRatio,
                verdict, reason);
        log.info("音频预检 verdict={} {}", verdict, result.summary());
        return result;
    }

    /** 启动 ffmpeg 跑全文件音频分析。流式读 stderr，遇到 time= 行就报进度。 */
    private SampleStats runFullAnalysis(Path video, double totalDuration, IntConsumer progressCallback)
            throws IOException, InterruptedException {
        // -vn 跳过视频流（不解码视频帧，大幅省 CPU + IO）；只过音频做滤镜分析。
        // 滤镜链：volumedetect 输出整段 mean/max；silencedetect 按 chunk 持续输出 silence_start/end。
        String filter = "volumedetect,"
                + "silencedetect=noise=" + SILENCE_NOISE_DB + "dB"
                + ":d=" + SILENCE_MIN_DURATION;
        ProcessBuilder pb = new ProcessBuilder(
                props.getBinary(),
                "-hide_banner",
                "-nostdin",
                "-i", video.toAbsolutePath().toString(),
                "-vn",
                "-af", filter,
                "-f", "null",
                "-"
        );
        Process process = registry.spawn(pb);
        SampleStats stats = new SampleStats();
        // ffmpeg 把分析结果写到 stderr，stdout 是 null muxer 的二进制输出（这里不消费）。
        // 必须把 stdout 也排空，否则 pipe 满了会让 ffmpeg 卡住。
        Thread stdoutDrain = Thread.ofVirtual().name("audio-probe-stdout").start(() -> {
            try (var s = process.getInputStream()) {
                s.transferTo(java.io.OutputStream.nullOutputStream());
            } catch (IOException ignored) {
            }
        });
        int lastReportedPct = -1;
        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) {
                if (log.isDebugEnabled()) log.debug("[audio-probe] {}", line);
                Matcher m;
                if ((m = MEAN_VOLUME_RE.matcher(line)).find()) {
                    stats.meanVolumeDb = Double.parseDouble(m.group(1));
                } else if ((m = MAX_VOLUME_RE.matcher(line)).find()) {
                    stats.maxVolumeDb = Double.parseDouble(m.group(1));
                } else if ((m = SILENCE_DURATION_RE.matcher(line)).find()) {
                    stats.totalSilenceSeconds += Double.parseDouble(m.group(1));
                } else if (progressCallback != null && totalDuration > 0
                        && (m = TIME_PROGRESS_RE.matcher(line)).find()) {
                    // ffmpeg 默认大约每秒输出一次 time= 行。折算成 0-100 百分比并去抖动 —
                    // 同一个百分比多次出现不重复回调，避免 SSE 被刷屏。
                    int h = Integer.parseInt(m.group(1));
                    int mm = Integer.parseInt(m.group(2));
                    double s = Double.parseDouble(m.group(3));
                    double progressedSec = h * 3600.0 + mm * 60.0 + s;
                    int pct = (int) Math.min(99, progressedSec / totalDuration * 100);
                    if (pct != lastReportedPct && pct >= 0) {
                        lastReportedPct = pct;
                        try {
                            progressCallback.accept(pct);
                        } catch (Exception cbErr) {
                            log.warn("progress callback threw: {}", cbErr.toString());
                        }
                    }
                }
            }
        }
        boolean exited = process.waitFor(PROBE_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        if (!exited) {
            process.destroyForcibly();
            try { stdoutDrain.join(500); } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            throw new IOException("音频预检超时（> " + PROBE_TIMEOUT_SECONDS + "s）");
        }
        try { stdoutDrain.join(500); } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
        int exit = process.exitValue();
        if (exit != 0) {
            throw new IOException("ffmpeg 退出码 " + exit);
        }
        // 成功跑完最后一份 progress = 100
        if (progressCallback != null) {
            try { progressCallback.accept(100); } catch (Exception ignored) { /* 末尾失败无害 */ }
        }
        return stats;
    }

    /** ffmpeg stderr 解析出的中间累计值。 */
    private static final class SampleStats {
        double meanVolumeDb = 0;
        double maxVolumeDb = 0;
        double totalSilenceSeconds = 0;
    }
}
