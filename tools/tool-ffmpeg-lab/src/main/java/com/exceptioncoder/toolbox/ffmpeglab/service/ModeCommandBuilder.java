package com.exceptioncoder.toolbox.ffmpeglab.service;

import com.exceptioncoder.toolbox.common.media.FfmpegProbe;
import com.exceptioncoder.toolbox.common.media.FfmpegProperties;
import com.exceptioncoder.toolbox.common.media.ProbeResult;
import com.exceptioncoder.toolbox.ffmpeglab.domain.TranscodeMode;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 各模式 ffmpeg 命令的**唯一构建源**。探测预览（{@link #preview}）与实跑（{@link #build}）走同一套
 * 拼装逻辑，保证「页面上看到的命令」就是「实际跑的命令」。
 *
 * <p>编码器按 {@code toolbox.ffmpeg.hwaccel} 映射（与 treesize 的 HlsService 同款），留空即软编 libx264。
 */
@Component
public class ModeCommandBuilder {

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
                cmd.add("-c:a"); cmd.add("aac");
                cmd.add("-b:a"); cmd.add("128k");
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
                cmd.add("-c:a"); cmd.add("aac");
                cmd.add("-b:a"); cmd.add("128k");
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

    /** progressive / fmp4 的视频重编码参数（软编时补 preset/crf）。 */
    private void addVideoEncode(List<String> cmd) {
        String enc = videoEncoder();
        cmd.add("-c:v"); cmd.add(enc);
        if (enc.equals("libx264")) {
            cmd.add("-preset"); cmd.add("veryfast");
            cmd.add("-crf"); cmd.add("23");
        }
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
            cmd.add("-c:a"); cmd.add("aac");
            cmd.add("-b:a"); cmd.add("128k");
        }
    }

    /** hwaccel → x264 兼容编码器映射；留空 / auto → libx264 软编。 */
    private String videoEncoder() {
        String hw = props.getHwaccel() == null ? "" : props.getHwaccel().toLowerCase(Locale.ROOT);
        return switch (hw) {
            case "qsv" -> "h264_qsv";
            case "nvenc", "cuda" -> "h264_nvenc";
            case "amf", "d3d11va" -> "h264_amf";
            case "videotoolbox" -> "h264_videotoolbox";
            default -> "libx264";
        };
    }
}
