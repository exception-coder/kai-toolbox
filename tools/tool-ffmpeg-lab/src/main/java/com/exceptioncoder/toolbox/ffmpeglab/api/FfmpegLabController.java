package com.exceptioncoder.toolbox.ffmpeglab.api;

import com.exceptioncoder.toolbox.ffmpeglab.api.dto.ProbeView;
import com.exceptioncoder.toolbox.ffmpeglab.api.dto.RecentRunsView;
import com.exceptioncoder.toolbox.ffmpeglab.api.dto.RunRequest;
import com.exceptioncoder.toolbox.ffmpeglab.api.dto.RunResultView;
import com.exceptioncoder.toolbox.ffmpeglab.service.FfmpegLabService;
import com.exceptioncoder.toolbox.ffmpeglab.service.FfmpegLabService.RunOutcome;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.ResourceRegion;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRange;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;

/**
 * FFmpeg 转码实验台端点。{@code /probe} 给出每模式预判 + 命令；{@code /run} 实跑一个模式；
 * {@code /play/*} 按投递类型托管物料；{@code /runs/recent} 供诊断表轮询。
 *
 * <p>失败语义：ffmpeg 退出码非 0 仍返回 200（失败本身是实验台要呈现的结果）；
 * 仅文件不存在→404、ffmpeg 不可用→503（由全局异常处理转换）。
 */
@RestController
@RequestMapping("/api/ffmpeg-lab")
public class FfmpegLabController {

    private final FfmpegLabService service;

    public FfmpegLabController(FfmpegLabService service) {
        this.service = service;
    }

    @GetMapping("/probe")
    public ProbeView probe(@RequestParam String path,
                           @RequestParam(required = false) Integer clipSeconds) throws IOException {
        return service.probeAndPredict(path, clipSeconds);
    }

    @PostMapping("/run")
    public RunResultView run(@RequestBody RunRequest req) throws IOException {
        RunOutcome outcome = service.run(req);
        return toView(outcome);
    }

    /**
     * 托管 progressive / remux 的 mp4 产物，支持 Range（{@code <video>} 拖动）。
     * {@code name} 目前恒为 out.mp4，保留路径变量以便未来多产物。
     */
    @GetMapping("/play/file/{runId}/{name}")
    public ResponseEntity<ResourceRegion> playFile(@PathVariable String runId,
                                                   @PathVariable String name,
                                                   @RequestHeader HttpHeaders headers) throws IOException {
        Path file = service.resolveArtifact(runId, name);
        long length = Files.size(file);
        Resource resource = new FileSystemResource(file);
        MediaType mime = MediaType.parseMediaType("video/mp4");
        List<HttpRange> ranges = headers.getRange();
        if (ranges.isEmpty()) {
            return ResponseEntity.ok()
                    .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                    .contentType(mime)
                    .body(new ResourceRegion(resource, 0, length));
        }
        ResourceRegion region = ranges.get(0).toResourceRegion(resource);
        return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .contentType(mime)
                .body(region);
    }

    /**
     * 托管 HLS 物料：m3u8 播放列表 + 分段（ts / m4s / init.mp4）。分段相对路径由浏览器对 m3u8 URL 解析，
     * 故同前缀目录即可。content-type 按扩展名区分。
     */
    @GetMapping("/play/hls/{runId}/{name}")
    public ResponseEntity<StreamingResponseBody> playHls(@PathVariable String runId,
                                                         @PathVariable String name) throws IOException {
        Path file = service.resolveArtifact(runId, name);
        MediaType mime = hlsMime(name);
        StreamingResponseBody body = out -> {
            try (var in = Files.newInputStream(file)) {
                in.transferTo(out);
            }
        };
        return ResponseEntity.ok().contentType(mime).body(body);
    }

    /** MJPEG 帧流：multipart/x-mixed-replace 直出给 {@code <img>}。 */
    @GetMapping("/play/mjpeg")
    public ResponseEntity<StreamingResponseBody> playMjpeg(@RequestParam String path,
                                                           @RequestParam String runId,
                                                           @RequestParam(required = false) Integer clipSeconds)
            throws IOException {
        int clip = clipSeconds == null ? service.defaultClipSeconds() : Math.max(0, clipSeconds);
        Path file = Path.of(path).normalize();
        if (!Files.isRegularFile(file)) {
            throw new NoSuchFileException(path);
        }
        // ffmpeg mpjpeg muxer 用 boundary "ffmpeg"。
        StreamingResponseBody body = out -> service.streamMjpeg(runId, file, clip, out);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("multipart/x-mixed-replace; boundary=ffmpeg"))
                .body(body);
    }

    @GetMapping("/runs/recent")
    public RecentRunsView recentRuns() {
        List<RecentRunsView.RunItem> runs = service.recent().stream()
                .map(RecentRunsView.RunItem::from)
                .toList();
        return new RecentRunsView(service.activeFfmpegCount(), runs);
    }

    // ============================ 内部 ============================

    private RunResultView toView(RunOutcome o) {
        String playKind = o.mode().playKind().name().toLowerCase(Locale.ROOT);
        String playUrl = buildPlayUrl(o);
        return new RunResultView(
                o.runId(), o.mode().name(), o.streaming(), o.success(), o.exitCode(), o.command(),
                o.firstByteMs(), o.totalMs(), o.outputBytes(), o.stderrTail(), playUrl, playKind);
    }

    private String buildPlayUrl(RunOutcome o) {
        return switch (o.mode()) {
            case REMUX_COPY, PROGRESSIVE_MP4 -> "/api/ffmpeg-lab/play/file/" + o.runId() + "/out.mp4";
            case HLS_TS, HLS_FMP4 -> "/api/ffmpeg-lab/play/hls/" + o.runId() + "/index.m3u8";
            case MJPEG -> "/api/ffmpeg-lab/play/mjpeg?runId=" + o.runId()
                    + "&path=" + java.net.URLEncoder.encode(o.input().toAbsolutePath().toString(),
                            java.nio.charset.StandardCharsets.UTF_8)
                    + "&clipSeconds=" + o.clipSeconds();
        };
    }

    private static MediaType hlsMime(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".m3u8")) return MediaType.parseMediaType("application/vnd.apple.mpegurl");
        if (lower.endsWith(".ts")) return MediaType.parseMediaType("video/mp2t");
        if (lower.endsWith(".m4s") || lower.endsWith(".mp4")) return MediaType.parseMediaType("video/mp4");
        return MediaType.APPLICATION_OCTET_STREAM;
    }
}
