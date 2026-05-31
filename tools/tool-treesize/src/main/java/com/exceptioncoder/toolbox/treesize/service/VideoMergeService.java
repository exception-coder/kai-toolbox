package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.common.media.FfmpegProbe;
import com.exceptioncoder.toolbox.common.media.FfmpegProcessRegistry;
import com.exceptioncoder.toolbox.common.media.ProbeResult;
import com.exceptioncoder.toolbox.treesize.api.dto.VideoMergeRequest;
import com.exceptioncoder.toolbox.treesize.api.dto.VideoMergeResult;
import com.exceptioncoder.toolbox.treesize.config.VideoMergeProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * 视频合并：把用户多选的若干视频按顺序拼成一个 mp4。同步阻塞，不进任务框架、不上 SSE。
 *
 * <p>策略：{@code auto}=探测后所有输入 (videoCodec,audioCodec,container) 一致则 copy 无损拼接，
 * 否则重编码；{@code copy}=强制 demuxer；{@code force}=强制重编码。重编码统一缩放 letterbox 到目标
 * 分辨率 + 帧率，软编 H.264+AAC。
 *
 * <p>无效输入（不存在 / 无视频流 / probe 失败）剔除并计 skippedCount；有效输入 &lt; 2 抛
 * {@link IllegalArgumentException}（controller 转 400）。失败时删半成品，不留垃圾。
 */
@Service
public class VideoMergeService {

    private static final Logger log = LoggerFactory.getLogger(VideoMergeService.class);

    private final FfmpegProbe ffprobe;
    private final FfmpegProcessRegistry ffmpeg;
    private final VideoMergeProperties props;

    public VideoMergeService(FfmpegProbe ffprobe, FfmpegProcessRegistry ffmpeg, VideoMergeProperties props) {
        this.ffprobe = ffprobe;
        this.ffmpeg = ffmpeg;
        this.props = props;
    }

    private record Probed(Path path, ProbeResult probe) {}

    public VideoMergeResult merge(VideoMergeRequest req) {
        long t0 = System.currentTimeMillis();
        List<String> paths = req.paths() == null ? List.of() : req.paths();
        int inputCount = paths.size();
        if (inputCount == 0) {
            throw new IllegalArgumentException("no input paths");
        }
        if (inputCount > props.getMaxInputs()) {
            throw new IllegalArgumentException(
                    "too many inputs: " + inputCount + " > maxInputs=" + props.getMaxInputs());
        }

        // 逐个 ffprobe 过滤无效输入（不存在 / 无视频流 / probe 失败）
        List<Probed> valid = new ArrayList<>();
        for (String p : paths) {
            Path src = Path.of(p);
            if (!Files.isRegularFile(src)) {
                log.info("merge skip not_found {}", p);
                continue;
            }
            try {
                ProbeResult pr = ffprobe.probe(src);
                if (pr == ProbeResult.UNKNOWN || "unknown".equals(pr.videoCodec())) {
                    log.info("merge skip no_video_stream {}", p);
                    continue;
                }
                valid.add(new Probed(src, pr));
            } catch (Exception e) {
                log.info("merge skip probe_failed {} : {}", p, e.toString());
            }
        }
        int mergedCount = valid.size();
        int skippedCount = inputCount - mergedCount;
        if (mergedCount < 2) {
            throw new IllegalArgumentException("too_few_valid_inputs: " + mergedCount + " (need >= 2)");
        }

        boolean reencode = switch (req.reencodeOrAuto()) {
            case "copy" -> false;
            case "force" -> true;
            default -> !uniform(valid);   // auto
        };
        // 重编码且存在无音轨输入时，统一输出无音轨（本期为保证稳定不做逐段补静音）
        boolean allHaveAudio = valid.stream().allMatch(p -> !"(none)".equals(p.probe().audioCodec()));

        List<Path> inputs = valid.stream().map(Probed::path).toList();
        Path out = resolveOutput(mergedCount);
        try {
            if (reencode) {
                ffmpeg.concatReencode(inputs, out, props.getTargetResolution(),
                        props.getTargetFps(), allHaveAudio, props.getTimeoutS());
            } else {
                ffmpeg.concatCopy(inputs, out, props.getTimeoutS());
            }
            long bytes = Files.size(out);
            log.info("video merge done: inputs={} merged={} skipped={} reencode={} bytes={} out={}",
                    inputCount, mergedCount, skippedCount, reencode, bytes, out);
            return new VideoMergeResult(out.toString(), inputCount, mergedCount, skippedCount,
                    bytes, reencode, System.currentTimeMillis() - t0);
        } catch (IOException | InterruptedException | RuntimeException e) {
            try { Files.deleteIfExists(out); } catch (IOException ignored) {}
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new RuntimeException("merge failed: " + e.getMessage(), e);
        }
    }

    /** 所有输入的 (videoCodec, audioCodec, container) 完全一致才允许 copy。 */
    private boolean uniform(List<Probed> inputs) {
        ProbeResult f = inputs.get(0).probe();
        return inputs.stream().allMatch(p ->
                p.probe().videoCodec().equals(f.videoCodec())
                        && p.probe().audioCodec().equals(f.audioCodec())
                        && p.probe().container().equals(f.container()));
    }

    private Path resolveOutput(int mergedCount) {
        String dir = props.getOutputDir();
        Path base = (dir == null || dir.isBlank())
                ? Path.of(System.getProperty("user.home"), ".kai-toolbox", "merged")
                : Path.of(dir);
        try {
            Files.createDirectories(base);
        } catch (IOException e) {
            throw new RuntimeException("cannot create merge output dir: " + base, e);
        }
        return base.resolve("merged_" + mergedCount + "clips_" + System.currentTimeMillis() + ".mp4");
    }
}
