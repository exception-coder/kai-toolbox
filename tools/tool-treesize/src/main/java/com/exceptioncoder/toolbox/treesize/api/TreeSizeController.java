package com.exceptioncoder.toolbox.treesize.api;

import com.exceptioncoder.toolbox.common.media.FfmpegProbe;
import com.exceptioncoder.toolbox.common.media.ThumbnailService;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.exceptioncoder.toolbox.treesize.api.dto.NodeView;
import com.exceptioncoder.toolbox.treesize.api.dto.ScanView;
import com.exceptioncoder.toolbox.treesize.api.dto.StartScanRequest;
import com.exceptioncoder.toolbox.treesize.api.dto.CleanJunkResultView;
import com.exceptioncoder.toolbox.treesize.api.dto.CleanupCandidateView;
import com.exceptioncoder.toolbox.treesize.api.dto.SshHostRequest;
import com.exceptioncoder.toolbox.treesize.api.dto.SshHostView;
import com.exceptioncoder.toolbox.treesize.api.dto.SubtitleJobView;
import com.exceptioncoder.toolbox.treesize.api.dto.SymlinkRequest;
import com.exceptioncoder.toolbox.treesize.api.dto.SymlinkResultView;
import com.exceptioncoder.toolbox.treesize.api.dto.TestSshHostResultView;
import com.exceptioncoder.toolbox.treesize.api.dto.VideoConfigView;
import com.exceptioncoder.toolbox.treesize.api.dto.VideoLibraryItemView;
import com.exceptioncoder.toolbox.treesize.api.dto.VideoLibraryPageView;
import com.exceptioncoder.toolbox.treesize.config.VideoExtensionsProperties;
import com.exceptioncoder.toolbox.common.media.ProbeResult;
import com.exceptioncoder.toolbox.treesize.domain.ScanRecord;
import com.exceptioncoder.toolbox.treesize.domain.ScanSourceType;
import com.exceptioncoder.toolbox.treesize.domain.VideoSizeBucket;
import com.exceptioncoder.toolbox.treesize.repository.NodeRepository;
import com.exceptioncoder.toolbox.treesize.repository.ScanRepository;
import com.exceptioncoder.toolbox.treesize.service.ActivePlaybackTracker;
import com.exceptioncoder.toolbox.treesize.service.FileDeleteService;
import com.exceptioncoder.toolbox.treesize.service.HlsService;
import com.exceptioncoder.toolbox.treesize.service.PathAccessGuard;
import com.exceptioncoder.toolbox.treesize.service.RawStreamService;
import com.exceptioncoder.toolbox.treesize.service.ScanService;
import com.exceptioncoder.toolbox.treesize.service.CleanupAdvisor;
import com.exceptioncoder.toolbox.treesize.service.SshHostService;
import com.exceptioncoder.toolbox.treesize.service.SubtitleService;
import com.exceptioncoder.toolbox.treesize.service.SymlinkService;
import com.exceptioncoder.toolbox.treesize.service.ThumbnailWarmer;
import jakarta.validation.Valid;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.ResourceRegion;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

@RestController
@RequestMapping("/api/treesize")
public class TreeSizeController {

    private final ScanService scanService;
    private final ScanRepository scans;
    private final NodeRepository nodes;
    private final SseEmitterRegistry sse;
    private final PathAccessGuard guard;
    private final RawStreamService raw;
    private final HlsService hls;
    private final FileDeleteService fileDelete;
    private final ThumbnailService thumbnails;
    private final ThumbnailWarmer thumbnailWarmer;
    private final ActivePlaybackTracker playbackTracker;
    private final FfmpegProbe ffmpeg;
    private final VideoExtensionsProperties videoExt;
    private final SubtitleService subtitles;
    private final SshHostService sshHosts;
    private final CleanupAdvisor cleanupAdvisor;
    private final SymlinkService symlink;

    public TreeSizeController(ScanService scanService,
                              ScanRepository scans,
                              NodeRepository nodes,
                              SseEmitterRegistry sse,
                              PathAccessGuard guard,
                              RawStreamService raw,
                              HlsService hls,
                              FileDeleteService fileDelete,
                              ThumbnailService thumbnails,
                              ThumbnailWarmer thumbnailWarmer,
                              ActivePlaybackTracker playbackTracker,
                              FfmpegProbe ffmpeg,
                              VideoExtensionsProperties videoExt,
                              SubtitleService subtitles,
                              SshHostService sshHosts,
                              CleanupAdvisor cleanupAdvisor,
                              SymlinkService symlink) {
        this.scanService = scanService;
        this.scans = scans;
        this.nodes = nodes;
        this.sse = sse;
        this.guard = guard;
        this.raw = raw;
        this.hls = hls;
        this.fileDelete = fileDelete;
        this.thumbnails = thumbnails;
        this.thumbnailWarmer = thumbnailWarmer;
        this.playbackTracker = playbackTracker;
        this.ffmpeg = ffmpeg;
        this.videoExt = videoExt;
        this.subtitles = subtitles;
        this.sshHosts = sshHosts;
        this.cleanupAdvisor = cleanupAdvisor;
        this.symlink = symlink;
    }

    // ---------- existing endpoints (unchanged) ---------------------------

    @PostMapping("/scans")
    public ScanView start(@Valid @RequestBody StartScanRequest req) {
        ScanSourceType sourceType = parseSourceType(req.sourceType());
        ScanRecord rec = scanService.startScan(req.path(), sourceType, req.sshHostId());
        return ScanView.from(rec);
    }

    @GetMapping(value = "/scans/{id}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events(@PathVariable String id) {
        return sse.create(id);
    }

    @GetMapping("/scans/{id}")
    public ResponseEntity<ScanView> get(@PathVariable String id) {
        return scans.findById(id)
                .map(r -> ResponseEntity.ok(ScanView.from(r)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/scans")
    public List<ScanView> list() {
        return scans.findAll().stream().map(ScanView::from).toList();
    }

    @GetMapping("/scans/{id}/children")
    public List<NodeView> children(@PathVariable String id, @RequestParam(required = false) String path) {
        return nodes.findChildren(id, path).stream().map(NodeView::from).toList();
    }

    @GetMapping("/scans/{id}/cleanup-candidates")
    public List<CleanupCandidateView> cleanupCandidates(@PathVariable String id) {
        return cleanupAdvisor.advise(id).stream().map(CleanupCandidateView::from).toList();
    }

    @DeleteMapping("/scans/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        scanService.cancel(id);
        scans.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    // ---------- SSH host management --------------------------------------

    @GetMapping("/ssh-hosts")
    public List<SshHostView> listSshHosts() {
        return sshHosts.findAll().stream().map(SshHostView::from).toList();
    }

    @PostMapping("/ssh-hosts")
    public SshHostView createSshHost(@Valid @RequestBody SshHostRequest req) {
        return SshHostView.from(sshHosts.create(req));
    }

    @PutMapping("/ssh-hosts/{id}")
    public SshHostView updateSshHost(@PathVariable String id, @Valid @RequestBody SshHostRequest req) {
        return SshHostView.from(sshHosts.update(id, req));
    }

    @DeleteMapping("/ssh-hosts/{id}")
    public ResponseEntity<Void> deleteSshHost(@PathVariable String id) {
        sshHosts.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/ssh-hosts/test")
    public TestSshHostResultView testSshHost(@Valid @RequestBody SshHostRequest req) {
        String message = sshHosts.test(req);
        return new TestSshHostResultView(true, message);
    }

    @PostMapping("/ssh-hosts/{id}/test")
    public TestSshHostResultView testSavedSshHost(@PathVariable String id) {
        String message = sshHosts.test(sshHosts.findRequired(id));
        return new TestSshHostResultView(true, message);
    }

    // ---------- video playback endpoints ---------------------------------

    @GetMapping("/config")
    public VideoConfigView videoConfig() {
        return new VideoConfigView(videoExt.getExtensions(), ffmpeg.isFfmpegAvailable());
    }

    @RequestMapping(value = "/scans/{id}/probe", method = {RequestMethod.GET, RequestMethod.HEAD})
    public ResponseEntity<Void> probeFile(@PathVariable String id, @RequestParam String path) throws IOException {
        playbackTracker.touch();
        Path file = guard.resolve(id, path);
        ProbeResult info = ffmpeg.probe(file);
        boolean nativelyPlayable = ffmpeg.nativelyPlayable(info);
        return ResponseEntity.ok()
                .header("X-Native-Playable", Boolean.toString(nativelyPlayable))
                .header("X-Container", info.container())
                .header("X-Video-Codec", info.videoCodec())
                .header("X-Audio-Codec", info.audioCodec())
                .header("X-Duration-Seconds", String.valueOf(info.durationSeconds()))
                .header("X-Ffmpeg-Available", Boolean.toString(ffmpeg.isFfmpegAvailable()))
                .build();
    }

    @GetMapping("/scans/{id}/stream")
    public ResponseEntity<ResourceRegion> streamRaw(@PathVariable String id,
                                                    @RequestParam String path,
                                                    @RequestHeader HttpHeaders headers) throws IOException {
        playbackTracker.touch();
        Path file = guard.resolve(id, path);
        return raw.serve(file, headers);
    }

    @GetMapping(value = "/scans/{id}/hls/playlist.m3u8",
                produces = "application/vnd.apple.mpegurl")
    public ResponseEntity<String> hlsPlaylist(@PathVariable String id, @RequestParam String path) throws IOException {
        playbackTracker.touch();
        Path file = guard.resolve(id, path);
        String body = hls.playlist(id, file);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/vnd.apple.mpegurl"))
                .body(body);
    }

    @GetMapping(value = "/scans/{id}/hls/segment-{idx}.ts",
                produces = "video/mp2t")
    public ResponseEntity<StreamingResponseBody> hlsSegment(@PathVariable String id,
                                                             @PathVariable int idx,
                                                             @RequestParam String path) throws IOException {
        playbackTracker.touch();
        Path file = guard.resolve(id, path);
        StreamingResponseBody body = out -> hls.writeSegment(file, idx, out);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("video/mp2t"))
                .body(body);
    }

    /** Result of a single-file delete. {@code toTrash=false} means the file was permanently removed. */
    public record DeleteFileResult(boolean toTrash) {}

    @DeleteMapping("/scans/{id}/file")
    public DeleteFileResult deleteFile(@PathVariable String id, @RequestParam String path) throws IOException {
        Path file = guard.resolve(id, path);
        boolean toTrash = fileDelete.deleteByPath(id, file);
        return new DeleteFileResult(toTrash);
    }

    /**
     * Move a directory off the scan-root drive and replace the original path with an NTFS
     * junction. Source must be a real directory inside the current scan root; target may be
     * any absolute path on a writable local NTFS volume. Pass {@code taskId} (any unique
     * client-generated string) and subscribe to {@link #symlinkEvents(String)} first to
     * receive real-time progress.
     */
    @PostMapping("/scans/{id}/symlink")
    public SymlinkResultView createSymlink(@PathVariable String id, @Valid @RequestBody SymlinkRequest req) throws IOException {
        var r = symlink.relocateAndLink(id, req.sourcePath(), req.targetPath(), req.taskId());
        return new SymlinkResultView(r.sourcePath(), r.targetPath(), r.movedBytes());
    }

    /** SSE channel for symlink-task progress. Subscribe before POSTing to {@link #createSymlink}. */
    @GetMapping(value = "/symlink-events/{taskId}", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter symlinkEvents(@PathVariable String taskId) {
        return sse.create(taskId);
    }

    /**
     * Aggregate video files across completed scans, paginated. {@code sortBy / order}
     * fall back to {@code name asc} when given anything outside the whitelist; {@code limit}
     * is clamped to {@code [1, 1000]} and {@code offset} to {@code [0, ∞)}.
     *
     * <p>{@code .ts} is the legitimate MPEG-TS video container, so it stays in the global
     * whitelist (so click-to-play in TreeSize still works for genuine .ts videos), but it's
     * dropped from this aggregated library view because in practice {@code .ts} files on a
     * dev machine are TypeScript sources and would drown the list in noise.
     */
    @GetMapping("/videos")
    public VideoLibraryPageView libraryVideos(
            @RequestParam(defaultValue = "name") String sortBy,
            @RequestParam(defaultValue = "asc") String order,
            @RequestParam(defaultValue = "all") String sizeBucket,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "false") boolean favoritesOnly,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "200") int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 1000));
        int safeOffset = Math.max(0, offset);
        VideoSizeBucket bucket = VideoSizeBucket.parse(sizeBucket);
        List<String> libraryExtensions = videoExt.getExtensions().stream()
                .filter(e -> !"ts".equalsIgnoreCase(e))
                .toList();
        // Side-effect: kick the background thumbnail warmer the first time the library is
        // viewed in this JVM lifetime. Subsequent paginated calls are no-ops.
        thumbnailWarmer.kickOff();
        var result = nodes.findVideos(libraryExtensions, sortBy, order,
                bucket.minBytesInclusive(), bucket.maxBytesExclusive(),
                q, favoritesOnly,
                safeOffset, safeLimit);
        return new VideoLibraryPageView(
                result.items().stream().map(VideoLibraryItemView::from).toList(),
                result.total(),
                safeOffset,
                safeLimit);
    }

    /**
     * Toggle a video into the favorites list. Idempotent: re-favoriting an already-favorited
     * path is a no-op. Returns 204 (no body) so the frontend can fire-and-update its cache
     * optimistically without round-tripping the row.
     */
    @PostMapping("/videos/favorites")
    public ResponseEntity<Void> addVideoFavorite(@RequestParam String path) {
        nodes.addVideoFavorite(path, System.currentTimeMillis());
        return ResponseEntity.noContent().build();
    }

    /** Remove from favorites. 204 whether or not the row existed (idempotent). */
    @DeleteMapping("/videos/favorites")
    public ResponseEntity<Void> removeVideoFavorite(@RequestParam String path) {
        nodes.removeVideoFavorite(path);
        return ResponseEntity.noContent().build();
    }

    /**
     * One-shot batch cleanup of macOS AppleDouble metadata files ({@code ._foo.mp4}) that
     * masquerade as videos because they share the extension. Hard-coded safety net: only
     * touches files smaller than 10 KiB at delete time, so a real video that happens to
     * start with a dot but exceed the threshold is left alone.
     */
    @DeleteMapping("/videos/junk")
    public CleanJunkResultView cleanJunkVideos() {
        var r = fileDelete.cleanJunkVideos(videoExt.getExtensions(), 10L * 1024);
        return new CleanJunkResultView(r.deleted(), r.skipped(), r.errors());
    }

    /**
     * Returns a 9-grid (or single-frame fallback for very short clips) JPEG thumbnail for
     * the given video. Generated on first request and cached on disk under
     * {@code ${user.home}/.kai-toolbox/cache/thumbs/}.
     *
     * <p>404 on any failure (unsupported file, ffmpeg crash, source gone). Logging is at
     * DEBUG so a video the user can't actually preview doesn't spam {@code ERROR} lines —
     * the frontend's {@code <img onerror>} swaps in a {@code Film} icon either way.
     */
    @GetMapping(value = "/scans/{id}/thumb", produces = "image/jpeg")
    public ResponseEntity<Resource> thumbnail(@PathVariable String id, @RequestParam String path) throws IOException {
        Path source = guard.resolve(id, path);
        Path jpeg;
        try {
            jpeg = thumbnails.getOrGenerate(source);
        } catch (IOException e) {
            // Expected for unsupported / broken files; the .failed marker is already written
            // so subsequent requests skip the ffmpeg fork.
            return ResponseEntity.notFound().build();
        }
        Resource body = new FileSystemResource(jpeg);
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=86400")
                .body(body);
    }

    // ---------- subtitle generation endpoints ----------------------------

    /**
     * Look up the subtitle job for a video. Returns 404 when no job exists yet — the frontend
     * uses that to decide whether to show "生成字幕" vs "已生成 / 生成中".
     */
    @GetMapping("/subtitles/by-video")
    public ResponseEntity<SubtitleJobView> getSubtitleByVideo(@RequestParam String scanId,
                                                              @RequestParam String path) throws IOException {
        Path video = guard.resolve(scanId, path);
        return subtitles.findByVideoPath(video.toAbsolutePath().toString())
                .map(j -> ResponseEntity.ok(SubtitleJobView.from(j)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * Kick off a subtitle generation job. Idempotent: if a job (any status) already exists for
     * this video, that record is returned — call {@link #deleteSubtitle} first to force a redo.
     */
    @PostMapping("/subtitles/jobs")
    public SubtitleJobView createSubtitle(@RequestParam String scanId,
                                          @RequestParam String path,
                                          @RequestParam(required = false, defaultValue = "auto") String language) throws IOException {
        Path video = guard.resolve(scanId, path);
        return SubtitleJobView.from(subtitles.enqueue(scanId, video, language));
    }

    @GetMapping("/subtitles/jobs/{jobId}")
    public ResponseEntity<SubtitleJobView> getSubtitleJob(@PathVariable String jobId) {
        return subtitles.findById(jobId)
                .map(j -> ResponseEntity.ok(SubtitleJobView.from(j)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping(value = "/subtitles/jobs/{jobId}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subtitleEvents(@PathVariable String jobId) {
        return sse.create(jobId);
    }

    @PostMapping("/subtitles/jobs/{jobId}/translate")
    public ResponseEntity<Void> translateSubtitle(@PathVariable String jobId) {
        boolean ok = subtitles.translateExisting(jobId);
        return ok ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @PostMapping("/subtitles/jobs/{jobId}/cancel")
    public ResponseEntity<Void> cancelSubtitle(@PathVariable String jobId) {
        subtitles.cancel(jobId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/subtitles/jobs/{jobId}")
    public ResponseEntity<Void> deleteSubtitle(@PathVariable String jobId) {
        return subtitles.delete(jobId)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }

    /**
     * Static-serve a generated VTT file. The path is taken from the job row; clients only
     * supply {@code jobId}, never a filesystem path, so there is no traversal concern.
     */
    @GetMapping(value = "/subtitles/jobs/{jobId}/vtt/translated", produces = "text/vtt")
    public ResponseEntity<Resource> serveTranslatedVtt(@PathVariable String jobId) {
        var job = subtitles.findById(jobId).orElse(null);
        if (job == null || job.getTranslatedVttPath() == null) {
            return ResponseEntity.notFound().build();
        }
        var resource = new FileSystemResource(job.getTranslatedVttPath());
        if (!resource.exists()) return ResponseEntity.notFound().build();
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=300")
                .header(HttpHeaders.CONTENT_TYPE, "text/vtt;charset=UTF-8")
                .body(resource);
    }

    @GetMapping(value = "/subtitles/jobs/{jobId}/vtt", produces = "text/vtt")
    public ResponseEntity<Resource> serveVtt(@PathVariable String jobId) {
        var job = subtitles.findById(jobId).orElse(null);
        if (job == null || job.getVttPath() == null) {
            return ResponseEntity.notFound().build();
        }
        Path vtt = Path.of(job.getVttPath());
        if (!java.nio.file.Files.isRegularFile(vtt)) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/vtt;charset=UTF-8"))
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=300")
                .body(new FileSystemResource(vtt));
    }

    private static ScanSourceType parseSourceType(String sourceType) {
        if (sourceType == null || sourceType.isBlank()) {
            return ScanSourceType.LOCAL_WINDOWS;
        }
        return ScanSourceType.valueOf(sourceType);
    }
}
