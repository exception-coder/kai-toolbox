package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.common.media.FfmpegProcessRegistry;
import com.exceptioncoder.toolbox.common.media.FfmpegProperties;
import com.exceptioncoder.toolbox.common.media.FfmpegUnavailableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Pulls a 16 kHz mono PCM s16le WAV out of any video container ffmpeg can read.
 * That format is what whisper.cpp expects natively — anything else makes it resample
 * internally, which is a non-trivial CPU hit.
 *
 * <p>Output goes to a caller-chosen temp file so the SubtitleService can decide where
 * to put it (typically next to the VTT output) and is responsible for cleaning up after.
 */
@Component
public class AudioExtractor {

    private static final Logger log = LoggerFactory.getLogger(AudioExtractor.class);
    private static final long EXTRACTION_TIMEOUT_MINUTES = 30;

    private final FfmpegProperties props;
    private final FfmpegProcessRegistry registry;

    public AudioExtractor(FfmpegProperties props, FfmpegProcessRegistry registry) {
        this.props = props;
        this.registry = registry;
    }

    /**
     * Block until the WAV is fully written. Throws if ffmpeg exits non-zero or the
     * 30 min wall-clock cap fires (kill switch for a runaway transcode of a corrupt file).
     */
    public void extract(Path video, Path outWav) throws IOException, InterruptedException {
        if (props.getBinary().isEmpty()) {
            throw new FfmpegUnavailableException("FFmpeg 不可用，请在 application.yml 配置 toolbox.ffmpeg.binary");
        }
        Files.createDirectories(outWav.getParent());

        // dynaudnorm is a per-frame loudness normaliser — much friendlier to ASR input than the
        // two-pass loudnorm filter. Soft-spoken / far-field segments get lifted up to the same
        // working range as the rest of the track so whisper.cpp doesn't decide the speech is
        // silence and skip the segment entirely (a classic "吞字" cause).
        //   f=200  ~4.6 s analysis window — wide enough to smooth syllables without pumping
        //   g=15   gaussian smoothing across frames — keeps natural attack/decay
        //   p=0.95 leave 5 % headroom so quiet peaks don't clip after gain
        List<String> cmd = List.of(
                props.getBinary(),
                "-loglevel", "warning",
                "-nostdin",
                "-y",
                "-i", video.toAbsolutePath().toString(),
                "-vn",
                "-af", "dynaudnorm=f=200:g=15:p=0.95",
                "-ac", "1",
                "-ar", "16000",
                "-acodec", "pcm_s16le",
                "-f", "wav",
                outWav.toAbsolutePath().toString()
        );

        Process process = registry.spawn(new ProcessBuilder(cmd).redirectErrorStream(false));
        Thread stderr = drainStderr(process);
        try {
            if (!process.waitFor(EXTRACTION_TIMEOUT_MINUTES, TimeUnit.MINUTES)) {
                process.destroyForcibly();
                throw new IOException("ffmpeg audio extraction timed out after "
                        + EXTRACTION_TIMEOUT_MINUTES + " min for " + video);
            }
            int exit = process.exitValue();
            if (exit != 0) {
                throw new IOException("ffmpeg audio extraction failed (exit " + exit + ") for " + video);
            }
            // 老旧容器（.rmvb / .rm 配合 cook / sipr 音频编码）经常被 ffmpeg 解出极小的 wav —
            // 看起来抽取成功但实际只有片头几秒甚至全静默。1KB 阈值能稳定捕获这类失败，
            // 提前抛错比让 whisper 跑完再说「无语音」更直接。
            long size = Files.size(outWav);
            if (size < 1024) {
                throw new IOException(
                        "音频抽取异常：生成的 wav 文件只有 " + size + " 字节，几乎是空的。"
                                + "可能是源视频的音频编码（如 .rmvb 里的 RealAudio cook）"
                                + "在当前 ffmpeg 下解码不完整。建议用其他播放器确认源视频音轨是否正常。");
            }
        } finally {
            try {
                stderr.join(500);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private static Thread drainStderr(Process process) {
        return Thread.ofVirtual().name("audio-extract-stderr").start(() -> {
            try (var reader = new BufferedReader(
                    new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    log.debug("[ffmpeg-extract] {}", line);
                }
            } catch (IOException ignored) {
            }
        });
    }
}
