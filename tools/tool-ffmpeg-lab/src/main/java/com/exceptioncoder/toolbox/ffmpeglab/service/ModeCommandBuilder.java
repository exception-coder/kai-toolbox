package com.exceptioncoder.toolbox.ffmpeglab.service;

import com.exceptioncoder.toolbox.common.media.FfmpegProbe;
import com.exceptioncoder.toolbox.common.media.FfmpegProperties;
import com.exceptioncoder.toolbox.common.media.ProbeResult;
import com.exceptioncoder.toolbox.ffmpeglab.domain.TranscodeMode;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * 各模式 ffmpeg 命令的**唯一构建源**。探测预览（{@link #preview}）与实跑（{@link #build}）走同一套
 * 拼装逻辑，保证「页面上看到的命令」就是「实际跑的命令」。
 *
 * <p>实验台一律软编 {@code libx264}，**不**继承生产侧 {@code toolbox.ffmpeg.hwaccel}：调试求稳，
 * 避开硬件编码器在边缘输入上的限制（如 h264_nvenc 对 96x80 这类超小帧直接 InitializeEncoder failed）。
 * 生产的 GPU 加速路径仍由 treesize 的 HlsService 负责。
 */
@Component
public class ModeCommandBuilder {

    /**
     * 重编码统一的视频滤镜：把过小的帧放大到至少 256x144（短边补足），保持宽高比、强制偶数尺寸。
     * 既绕过编码器最小帧限制，又让 96x80 这类邮票画面在 web 上看得清；正常尺寸视频
     * （force_original_aspect_ratio=increase 下目标框=自身）不会被缩小。逗号在 filtergraph 里需转义。
     */
    private static final String VIDEO_SCALE_FILTER =
            "scale=w=max(iw\\,256):h=max(ih\\,144):force_original_aspect_ratio=increase:force_divisible_by=2";

    private final FfmpegProbe probe;
    private final FfmpegProperties props;

    public ModeCommandBuilder(FfmpegProbe probe, FfmpegProperties props) {
        this.probe = probe;
        this.props = props;
    }

    /**
     * 产出可直接喂给 ProcessBuilder 的完整参数列表。
     *
     * @param mode        模式
     * @param input       源文件
     * @param info        ffprobe 结果（决定 HLS 是否能 copy）
     * @param clipSeconds 截断秒数，>0 时加 {@code -t}
     * @param workDir     临时物料目录（流式模式忽略）
     */
    public List<String> build(TranscodeMode mode, Path input, ProbeResult info, int clipSeconds, Path workDir) {
        List<String> cmd = new ArrayList<>();
        cmd.add(props.getBinary());
        cmd.add("-hide_banner");
        cmd.add("-loglevel"); cmd.add("warning");
        cmd.add("-y");
        if (clipSeconds > 0) {
            cmd.add("-t"); cmd.add(String.valueOf(clipSeconds));
        }
        cmd.add("-i"); cmd.add(input.toAbsolutePath().toString());

        switch (mode) {
            case REMUX_COPY -> {
                cmd.add("-c"); cmd.add("copy");
                cmd.add("-movflags"); cmd.add("+faststart");
                cmd.add("-f"); cmd.add("mp4");
                cmd.add(workDir.resolve("out.mp4").toString());
            }
            case PROGRESSIVE_MP4 -> {
                addVideoEncode(cmd);
                addAudioEncode(cmd);
                cmd.add("-movflags"); cmd.add("+faststart");
                cmd.add("-f"); cmd.add("mp4");
                cmd.add(workDir.resolve("out.mp4").toString());
            }
            case HLS_TS -> {
                addHlsVideo(cmd, info);
                addHlsAudio(cmd, info);
                cmd.add("-f"); cmd.add("hls");
                cmd.add("-hls_time"); cmd.add("10");
                cmd.add("-hls_segment_type"); cmd.add("mpegts");
                cmd.add("-hls_playlist_type"); cmd.add("vod");
                cmd.add("-hls_flags"); cmd.add("independent_segments");
                cmd.add(workDir.resolve("index.m3u8").toString());
            }
            case HLS_FMP4 -> {
                // fMP4 分段不支持 video copy 的稳妥做法是统一重编码，避免 init 段与源参数不一致。
                addVideoEncode(cmd);
                addAudioEncode(cmd);
                cmd.add("-f"); cmd.add("hls");
                cmd.add("-hls_time"); cmd.add("10");
                cmd.add("-hls_segment_type"); cmd.add("fmp4");
                cmd.add("-hls_playlist_type"); cmd.add("vod");
                cmd.add(workDir.resolve("index.m3u8").toString());
            }
            case MJPEG -> {
                cmd.add("-an");
                cmd.add("-f"); cmd.add("mpjpeg");
                cmd.add("-q:v"); cmd.add("5");
                cmd.add("pipe:1");
            }
        }
        return cmd;
    }

    /** 展示用命令串：把 build 结果用空格拼起来。输入/输出已是绝对路径，方便用户直接复制到终端复跑。 */
    public String preview(TranscodeMode mode, Path input, ProbeResult info, int clipSeconds, Path workDir) {
        return String.join(" ", build(mode, input, info, clipSeconds, workDir));
    }

    /** progressive / fmp4 的视频重编码参数：scale 放大小帧 + 软编 libx264。 */
    private void addVideoEncode(List<String> cmd) {
        cmd.add("-vf"); cmd.add(VIDEO_SCALE_FILTER);
        cmd.add("-pix_fmt"); cmd.add("yuv420p");
        cmd.add("-c:v"); cmd.add("libx264");
        cmd.add("-preset"); cmd.add("veryfast");
        cmd.add("-crf"); cmd.add("23");
    }

    /** 音频重编码：转 aac 并重采样到 44.1kHz，避开 qcelp/8kHz 这类低采样率下 aac 的 "Too many bits" 限制。 */
    private void addAudioEncode(List<String> cmd) {
        cmd.add("-c:a"); cmd.add("aac");
        cmd.add("-ar"); cmd.add("44100");
        cmd.add("-b:a"); cmd.add("128k");
    }

    /** HLS-TS 视频流：源是 h264 可直接 copy，否则重编码。 */
    private void addHlsVideo(List<String> cmd, ProbeResult info) {
        if (probe.canCopyVideo(info)) {
            cmd.add("-c:v"); cmd.add("copy");
        } else {
            addVideoEncode(cmd);
        }
    }

    /** HLS-TS 音频流：源是 aac/mp3/无音轨可 copy，否则转 aac。 */
    private void addHlsAudio(List<String> cmd, ProbeResult info) {
        if (probe.canCopyAudio(info)) {
            cmd.add("-c:a"); cmd.add("copy");
        } else {
            addAudioEncode(cmd);
        }
    }
}
