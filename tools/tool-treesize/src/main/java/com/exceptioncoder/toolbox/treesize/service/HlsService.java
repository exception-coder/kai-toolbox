package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.common.media.FfmpegProbe;
import com.exceptioncoder.toolbox.common.media.FfmpegProcessRegistry;
import com.exceptioncoder.toolbox.common.media.FfmpegProperties;
import com.exceptioncoder.toolbox.common.media.FfmpegUnavailableException;
import com.exceptioncoder.toolbox.common.media.ProbeResult;
import com.exceptioncoder.toolbox.treesize.domain.SegmentStat;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReferenceArray;

/**
 * On-demand HLS for non-natively-playable inputs. Playlists are stitched in memory from the
 * probed duration. Each segment request forks a fresh {@code ffmpeg -ss N -t 6 -f mpegts pipe:1}
 * whose stdout is piped straight to the HTTP response — nothing touches disk.
 *
 * <p>Process hygiene is the load-bearing concern here: every spawn must die when the request
 * dies, and stderr must drain on a separate thread or ffmpeg blocks on a full pipe buffer.
 */
@Component
public class HlsService {

    private static final Logger log = LoggerFactory.getLogger(HlsService.class);
    /**
     * 10 s segments instead of the HLS-default 6 s: each fork carries more useful work, halving
     * the per-segment startup overhead on the playback timeline. Seek granularity is still fine.
     */
    static final int SEGMENT_SECONDS = 10;
    private static final long PROCESS_GRACE_MS = 2000;
    /** How long {@link #writeSegment} will block waiting for an in-flight prewarm before giving up
     *  and falling back to spawning its own ffmpeg. Pad over a typical NVENC 10-s prewarm budget. */
    private static final long PREWARM_AWAIT_MS = 15_000;
    /** Hard cap on prewarm buffer to bound worst-case memory if the source explodes in size
     *  (extremely high bitrate, or a probe lied about duration). 64 MiB easily fits 10 s of
     *  4K H.264; anything over that suggests something is wrong and we abort. */
    private static final int PREWARM_MAX_BYTES = 64 * 1024 * 1024;
    /** Number of leading segments to prewarm. 2 covers "click → first frame" plus the gap before
     *  hls.js's own forward-buffering kicks in. Going higher is mostly waste — by segment 2 the
     *  player is already streaming faster than realtime on NVENC. */
    private static final int PREWARM_SEGMENT_COUNT = 2;

    private final FfmpegProbe probe;
    private final FfmpegProperties props;
    private final FfmpegProcessRegistry registry;
    private final PlaybackStatsCollector stats;
    /**
     * Per-segment prewarm cache, indexed by segment idx (0..{@link #PREWARM_SEGMENT_COUNT}-1).
     * Each slot holds the most recent prewarm for that idx — switching files invalidates every
     * slot whose key doesn't match the new file and force-kills the ffmpeg behind it.
     */
    private final AtomicReferenceArray<PrewarmEntry> prewarmSlots = new AtomicReferenceArray<>(PREWARM_SEGMENT_COUNT);
    /**
     * Runtime A/B toggle. {@code true} (default): hardware acceleration + segment prewarm — the
     * production path. {@code false}: forces software-encode (libx264 ultrafast) and disables
     * prewarm, so the user can compare wall-clock numbers in {@code PlaybackStatsPanel} without
     * restarting the JVM or editing application.yml.
     */
    private volatile boolean optimizationEnabled = true;

    public HlsService(FfmpegProbe probe, FfmpegProperties props, FfmpegProcessRegistry registry,
                      PlaybackStatsCollector stats) {
        this.probe = probe;
        this.props = props;
        this.registry = registry;
        this.stats = stats;
    }

    /**
     * Build an EXT-X-PLAYLIST-TYPE:VOD playlist whose segment count comes from the probed duration.
     * The last segment's EXTINF is rounded down to whatever fraction of {@link #SEGMENT_SECONDS}
     * the file actually has — getting this right is what lets hls.js seek to the very end.
     */
    public boolean isOptimizationEnabled() {
        return optimizationEnabled;
    }

    /**
     * Flip the A/B toggle. Flipping to {@code false} does not cancel an already in-flight prewarm —
     * the next playlist request just won't start a new one, and any pending entries that miss their
     * 15 s consume window will simply fall through to the regular spawn path.
     */
    public void setOptimizationEnabled(boolean enabled) {
        this.optimizationEnabled = enabled;
        log.info("HLS optimization toggled: {}", enabled ? "ON (hwaccel + prewarm)" : "OFF (software encode, no prewarm)");
    }

    public String playlist(String scanId, Path file) throws IOException {
        if (!probe.isFfmpegAvailable()) {
            throw new FfmpegUnavailableException("FFmpeg 不可用，请在 application.yml 配置 toolbox.ffmpeg.binary");
        }
        ProbeResult info = probe.probe(file);
        double duration = info.durationSeconds();
        if (duration <= 0) {
            throw new IOException("ffprobe could not determine duration for " + file);
        }
        int totalSegments = (int) Math.ceil(duration / SEGMENT_SECONDS);
        double tail = duration - (long) (duration / SEGMENT_SECONDS) * SEGMENT_SECONDS;
        if (tail <= 0.001) tail = SEGMENT_SECONDS;

        StringBuilder sb = new StringBuilder(256 + totalSegments * 64);
        sb.append("#EXTM3U\n");
        sb.append("#EXT-X-VERSION:3\n");
        sb.append("#EXT-X-TARGETDURATION:").append(SEGMENT_SECONDS).append('\n');
        sb.append("#EXT-X-MEDIA-SEQUENCE:0\n");
        sb.append("#EXT-X-PLAYLIST-TYPE:VOD\n");

        String pathParam = URLEncoder.encode(file.toAbsolutePath().toString(), StandardCharsets.UTF_8);
        for (int i = 0; i < totalSegments; i++) {
            double dur = (i == totalSegments - 1) ? tail : SEGMENT_SECONDS;
            sb.append(String.format(Locale.ROOT, "#EXTINF:%.3f,%n", dur));
            sb.append("segment-").append(i).append(".ts?path=").append(pathParam).append('\n');
        }
        sb.append("#EXT-X-ENDLIST\n");
        // Fire-and-forget: by the time hls.js parses this playlist and requests segment-0,
        // ffmpeg should already be most of the way through producing it. Skipped when the A/B
        // toggle is off so the comparison baseline isn't accidentally accelerated.
        if (optimizationEnabled) {
            schedulePrewarm(file, info);
        }
        return sb.toString();
    }

    /**
     * Transcode segment {@code idx} and pipe it to {@code out}. Throws when ffmpeg fails to
     * start, the index is past the end, or the client disconnects mid-stream (in which case
     * the spawned process is force-killed before the throw).
     */
    public void writeSegment(Path file, int idx, OutputStream out) throws IOException {
        if (!probe.isFfmpegAvailable()) {
            throw new FfmpegUnavailableException("FFmpeg 不可用，请在 application.yml 配置 toolbox.ffmpeg.binary");
        }
        ProbeResult info = probe.probe(file);
        double duration = info.durationSeconds();
        int totalSegments = (int) Math.ceil(duration / SEGMENT_SECONDS);
        if (idx < 0 || idx >= totalSegments) {
            throw new IllegalArgumentException("segment index " + idx + " out of [0, " + totalSegments + ")");
        }
        double startSec = (double) idx * SEGMENT_SECONDS;
        double dur = Math.min((double) SEGMENT_SECONDS, duration - startSec);
        boolean videoCopy = probe.canCopyVideo(info);
        boolean audioCopy = probe.canCopyAudio(info);
        String mode = (videoCopy && audioCopy) ? "copy" : "transcode";

        // Fast path: this segment was prewarmed by the playlist request (or by a prior segment
        // hit triggering rolling prewarm). Drain it straight to the client without forking
        // another ffmpeg. Any failure here silently falls through to the regular spawn path.
        if (idx < PREWARM_SEGMENT_COUNT) {
            byte[] cached = tryConsumePrewarm(file, idx);
            if (cached != null) {
                long t0Fast = System.nanoTime();
                out.write(cached);
                out.flush();
                long totalMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - t0Fast);
                stats.record(new SegmentStat(idx, file.getFileName().toString(), "prewarm",
                        0L, 0L, totalMs, cached.length, false, System.currentTimeMillis()));
                log.info("hls segment idx={} mode=prewarm total={}ms bytes={} file={}",
                        idx, totalMs, cached.length, file.getFileName());
                return;
            }
        }

        long t0 = System.nanoTime();
        long spawnMs = -1L;
        boolean clientDisconnected = false;
        Process process = null;
        Thread stderrDrain = null;
        TimedCountingOutputStream counting = null;

        try {
            List<String> cmd = buildSegmentCommand(file, startSec, dur, videoCopy, audioCopy, info.videoCodec());
            process = registry.spawn(new ProcessBuilder(cmd).redirectErrorStream(false));
            spawnMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - t0);
            stderrDrain = startStderrDrain(process);
            counting = new TimedCountingOutputStream(out, t0);

            try (var stdin = process.getInputStream()) {
                stdin.transferTo(counting);
                counting.flush();
            } catch (IOException e) {
                // Almost always: client closed the connection (EventSource abort, modal close).
                // Treat as expected, log at debug, and rely on the finally block to reap ffmpeg.
                clientDisconnected = true;
                log.debug("hls segment write aborted (client disconnect?) for {} idx={}: {}", file, idx, e.toString());
                throw e;
            }
        } finally {
            if (process != null) reap(process);
            if (stderrDrain != null) {
                try {
                    stderrDrain.join(500);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
            }
            long totalMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - t0);
            long firstByteMs = counting == null ? -1L : counting.firstByteMs();
            long bytesOut = counting == null ? 0L : counting.bytesWritten();
            SegmentStat stat = new SegmentStat(
                    idx, file.getFileName().toString(), mode,
                    spawnMs, firstByteMs, totalMs, bytesOut, clientDisconnected,
                    System.currentTimeMillis());
            stats.record(stat);
            log.info("hls segment idx={} mode={} spawn={}ms firstByte={}ms total={}ms bytes={} aborted={} file={}",
                    idx, mode, spawnMs, firstByteMs, totalMs, bytesOut, clientDisconnected, file.getFileName());
            if (process != null && !clientDisconnected && process.exitValue() != 0) {
                log.warn("ffmpeg segment exited with code {} for {} idx={}", process.exitValue(), file, idx);
            }
        }
    }

    /**
     * Wraps the response stream to capture the first-byte timestamp and total bytes written,
     * without changing the zero-copy {@code transferTo} path. {@code transferTo} invokes
     * {@link #write(byte[], int, int)} in a tight loop, so the two overrides below are the only
     * ones that need to count.
     *
     * <p>Intentionally does not override {@code close()} — Spring owns the response stream lifecycle.
     */
    private static final class TimedCountingOutputStream extends OutputStream {
        private final OutputStream delegate;
        private final long startNanos;
        private long firstByteNanos = -1L;
        private long bytesWritten = 0L;

        TimedCountingOutputStream(OutputStream delegate, long startNanos) {
            this.delegate = delegate;
            this.startNanos = startNanos;
        }

        @Override
        public void write(int b) throws IOException {
            if (firstByteNanos < 0) firstByteNanos = System.nanoTime();
            delegate.write(b);
            bytesWritten++;
        }

        @Override
        public void write(byte[] b, int off, int len) throws IOException {
            if (firstByteNanos < 0) firstByteNanos = System.nanoTime();
            delegate.write(b, off, len);
            bytesWritten += len;
        }

        @Override
        public void flush() throws IOException {
            delegate.flush();
        }

        long firstByteMs() {
            return firstByteNanos < 0 ? -1L : TimeUnit.NANOSECONDS.toMillis(firstByteNanos - startNanos);
        }

        long bytesWritten() {
            return bytesWritten;
        }
    }

    /**
     * Holds an in-flight or completed prewarm for one segment idx. {@code result} is the only
     * field that may transition from incomplete → complete; readers wait on it. {@code process}
     * is kept so a superseding prewarm (different file) can force-kill the old ffmpeg instead
     * of letting it finish into a buffer no one will read.
     */
    private record PrewarmEntry(String key, CompletableFuture<byte[]> result, Process process) {}

    private static String prewarmKey(Path file) {
        try {
            return file.toAbsolutePath() + "|" + Files.getLastModifiedTime(file).toMillis();
        } catch (IOException e) {
            return file.toAbsolutePath().toString();
        }
    }

    /**
     * Prewarm the first {@link #PREWARM_SEGMENT_COUNT} segments of {@code file}. Idempotent for
     * a file already being warmed; switching files invalidates every slot whose key doesn't match
     * and kills the ffmpeg behind it. Never throws — prewarm is an optimization, the regular
     * segment path stays the source of truth for correctness.
     */
    private void schedulePrewarm(Path file, ProbeResult info) {
        String key = prewarmKey(file);
        // First pass: evict every slot belonging to a different file so its ffmpeg dies promptly
        // even if we don't end up rewarming that slot below.
        for (int i = 0; i < PREWARM_SEGMENT_COUNT; i++) {
            PrewarmEntry existing = prewarmSlots.get(i);
            if (existing != null && !existing.key.equals(key)) {
                if (prewarmSlots.compareAndSet(i, existing, null)) {
                    existing.process.destroyForcibly();
                    existing.result.completeExceptionally(new IOException("prewarm superseded"));
                }
            }
        }

        double duration = info.durationSeconds();
        boolean videoCopy = probe.canCopyVideo(info);
        boolean audioCopy = probe.canCopyAudio(info);
        for (int idx = 0; idx < PREWARM_SEGMENT_COUNT; idx++) {
            double startSec = (double) idx * SEGMENT_SECONDS;
            if (startSec >= duration) break; // video shorter than the next segment
            PrewarmEntry existing = prewarmSlots.get(idx);
            if (existing != null && existing.key.equals(key)) continue; // already warming for this file
            spawnPrewarm(file, key, idx, startSec,
                    Math.min((double) SEGMENT_SECONDS, duration - startSec), videoCopy, audioCopy,
                    info.videoCodec());
        }
    }

    private void spawnPrewarm(Path file, String key, int idx, double startSec, double dur,
                              boolean videoCopy, boolean audioCopy, String videoCodec) {
        List<String> cmd = buildSegmentCommand(file, startSec, dur, videoCopy, audioCopy, videoCodec);
        Process process;
        try {
            process = registry.spawn(new ProcessBuilder(cmd).redirectErrorStream(false));
        } catch (IOException e) {
            log.debug("hls prewarm spawn failed idx={} for {}: {}", idx, file, e.toString());
            return;
        }
        CompletableFuture<byte[]> future = new CompletableFuture<>();
        PrewarmEntry entry = new PrewarmEntry(key, future, process);
        PrewarmEntry prior = prewarmSlots.get(idx);
        if (!prewarmSlots.compareAndSet(idx, prior, entry)) {
            // Lost a race — bail cleanly rather than leaking the spawn.
            process.destroyForcibly();
            return;
        }
        startStderrDrain(process);
        long t0 = System.nanoTime();
        Thread.ofVirtual().name("hls-prewarm-" + idx).start(() -> {
            try (var in = process.getInputStream();
                 var buf = new ByteArrayOutputStream(2 * 1024 * 1024)) {
                byte[] tmp = new byte[64 * 1024];
                int n;
                while ((n = in.read(tmp)) > 0) {
                    if (buf.size() + n > PREWARM_MAX_BYTES) {
                        log.warn("hls prewarm aborted: segment-{} > {} bytes for {}",
                                idx, PREWARM_MAX_BYTES, file.getFileName());
                        process.destroyForcibly();
                        future.completeExceptionally(new IOException("prewarm too large"));
                        prewarmSlots.compareAndSet(idx, entry, null);
                        return;
                    }
                    buf.write(tmp, 0, n);
                }
                process.waitFor(PROCESS_GRACE_MS, TimeUnit.MILLISECONDS);
                if (process.isAlive() || process.exitValue() != 0) {
                    process.destroyForcibly();
                    future.completeExceptionally(new IOException(
                            "ffmpeg prewarm exit=" + (process.isAlive() ? "?" : process.exitValue())));
                    prewarmSlots.compareAndSet(idx, entry, null);
                    return;
                }
                long readyMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - t0);
                future.complete(buf.toByteArray());
                log.info("hls prewarm ready idx={} in {}ms bytes={} file={}",
                        idx, readyMs, buf.size(), file.getFileName());
            } catch (Exception e) {
                future.completeExceptionally(e);
                prewarmSlots.compareAndSet(idx, entry, null);
            } finally {
                reap(process);
            }
        });
    }

    /**
     * If a prewarm exists for {@code (file, idx)}, wait up to {@link #PREWARM_AWAIT_MS} for it
     * and return the bytes; otherwise return null. The entry is cleared on consumption so the
     * buffer can be GC'd — a seek back will fall through to the normal spawn path.
     */
    private byte[] tryConsumePrewarm(Path file, int idx) {
        if (idx < 0 || idx >= PREWARM_SEGMENT_COUNT) return null;
        PrewarmEntry e = prewarmSlots.get(idx);
        if (e == null || !e.key.equals(prewarmKey(file))) return null;
        try {
            byte[] data = e.result.get(PREWARM_AWAIT_MS, TimeUnit.MILLISECONDS);
            prewarmSlots.compareAndSet(idx, e, null);
            return data;
        } catch (TimeoutException te) {
            log.debug("hls prewarm not ready in {}ms, falling back to spawn for {} idx={}",
                    PREWARM_AWAIT_MS, file.getFileName(), idx);
            return null;
        } catch (Exception ex) {
            log.debug("hls prewarm failed for {} idx={}: {}", file.getFileName(), idx, ex.toString());
            return null;
        }
    }

    /**
     * NVIDIA NVDEC 在 ffmpeg-cuda 上稳定支持的视频 codec 白名单。
     * <p>其它 codec(特别是 .avi 容器里常见的 mpeg4/XviD/DivX、mjpeg、wmv* 等)传 {@code -hwaccel cuda}
     * 会让 ffmpeg 在打开 decoder 时直接失败 exit 非 0,前端表现为视频「卡在缓冲」/无法播放。
     * 这种文件改走纯软件解码(libavcodec),编码端仍走 h264_nvenc,只在「解码 → 编码」之间
     * 多一次 GPU↔CPU memory 拷贝,性能损失远小于完全播不出。
     */
    private static final Set<String> NVDEC_SUPPORTED_CODECS = Set.of(
            "h264", "hevc", "h265", "vp8", "vp9", "av1",
            "mpeg2video", "mpeg2", "vc1"
    );

    /**
     * QSV / AMF / VideoToolbox 这几个非 NVIDIA 硬解后端在不同 OS / 显卡 / 驱动组合下 codec 支持
     * 差异极大,缺乏验证;只放过最稳的 h264/hevc。其它一律 fallback 到软件解码。
     */
    private static final Set<String> CONSERVATIVE_HW_CODECS = Set.of("h264", "hevc", "h265");

    /** 当前 hwaccel 后端是否能解出这个 codec。videoCodec 为 null / 未识别时一律返回 false。 */
    private static boolean canHwDecode(String hwaccel, String videoCodec) {
        if (videoCodec == null || videoCodec.isBlank()) return false;
        String c = videoCodec.toLowerCase(Locale.ROOT);
        return switch (hwaccel) {
            case "cuda", "nvenc" -> NVDEC_SUPPORTED_CODECS.contains(c);
            case "qsv", "amf", "d3d11va", "videotoolbox" -> CONSERVATIVE_HW_CODECS.contains(c);
            default -> false;
        };
    }

    private List<String> buildSegmentCommand(Path file, double startSec, double dur,
                                             boolean videoCopy, boolean audioCopy, String videoCodec) {
        List<String> cmd = new ArrayList<>();
        cmd.add(props.getBinary());
        cmd.add("-loglevel"); cmd.add("warning");
        cmd.add("-nostdin");
        // When the A/B toggle is OFF we ignore application.yml's hwaccel — comparison must run
        // pure-software so the user actually sees what NVENC bought.
        String hw = optimizationEnabled ? props.getHwaccel() : "";
        boolean nvidia = hw.equals("cuda") || hw.equals("nvenc");
        // -hwaccel must come BEFORE -i. Empty value = software decode/encode.
        // For NVIDIA we additionally pin -hwaccel_output_format cuda so decoded frames stay in VRAM
        // and feed h264_nvenc directly — no GPU↔CPU round-trip per frame.
        //
        // 解码端 hwaccel 仅在 codec 在 NVDEC/QSV/AMF 白名单内才开。.avi 里的 mpeg4(XviD/DivX)
        // 类老 codec 不在白名单 → 这里不传 -hwaccel,fallback 走 libavcodec 软解;编码端
        // videoEncoderFor(hw) 照常返回 h264_nvenc,所以编码仍走 GPU,只在解码 → 编码之间多
        // 一次 host memory 拷贝。
        boolean hwDecode = !videoCopy && !hw.isEmpty() && canHwDecode(hw, videoCodec);
        if (hwDecode) {
            cmd.add("-hwaccel"); cmd.add(nvidia ? "cuda" : hw);
            if (nvidia) {
                cmd.add("-hwaccel_output_format"); cmd.add("cuda");
                cmd.add("-extra_hw_frames"); cmd.add("8");
            }
        } else if (!videoCopy && !hw.isEmpty()) {
            log.debug("hls hwaccel decode disabled for codec={} (not in {} whitelist), encoding via {}",
                    videoCodec, hw, videoEncoderFor(hw));
        }
        // -ss before -i is the "fast seek" form: ffmpeg seeks via container index instead of decoding
        // up to the offset, which is what makes per-segment transcode latency tolerable.
        cmd.add("-ss"); cmd.add(String.format(Locale.ROOT, "%.3f", startSec));
        cmd.add("-t"); cmd.add(String.format(Locale.ROOT, "%.3f", dur));
        cmd.add("-i"); cmd.add(file.toAbsolutePath().toString());

        // 小帧兜底：软解重编码路径下，把过小的帧放大到至少 256x144（保宽高比、强制偶数尺寸）。
        // h264_nvenc 对 QCIF 级老视频（KDDI .amc/.3gp 的 mpeg4/h263，96x80 之类）会
        // InitializeEncoder failed: Frame Dimension less than minimum → 吐空段 → hls.js fragParsingError。
        // 仅在软解（CPU 帧）时加 CPU scale；hwDecode 路径帧在 VRAM 且都是现代大尺寸编码，不触碰。
        // 正常尺寸视频该滤镜是 no-op（max(iw,256)=iw）。
        if (!videoCopy && !hwDecode) {
            cmd.add("-vf");
            cmd.add("scale=w=max(iw\\,256):h=max(ih\\,144):force_original_aspect_ratio=increase:force_divisible_by=2");
        }

        // Video: copy if compatible, otherwise re-encode. Per-encoder tuning targets sub-100ms
        // first-byte latency so hls.js can start playing as soon as it requests a segment.
        if (videoCopy) {
            cmd.add("-c:v"); cmd.add("copy");
        } else {
            cmd.add("-c:v"); cmd.add(videoEncoderFor(hw));
            if (hw.isEmpty()) {
                // libx264: ultrafast + zerolatency is the only combination that keeps a single-thread
                // CPU encoder under realtime for 1080p HEVC → H.264.
                cmd.add("-preset"); cmd.add("ultrafast");
                cmd.add("-tune"); cmd.add("zerolatency");
                cmd.add("-crf"); cmd.add("23");
            } else if (nvidia) {
                // NVENC: p1 (fastest) + low-latency tune. CRF is ignored by NVENC — use cq with
                // rc=vbr and b:v=0 to get quality-targeted variable bitrate.
                cmd.add("-preset"); cmd.add("p1");
                cmd.add("-tune"); cmd.add("ll");
                cmd.add("-rc"); cmd.add("vbr");
                cmd.add("-cq"); cmd.add("22");
                cmd.add("-b:v"); cmd.add("0");
            } else {
                // QSV / AMF / VideoToolbox: keep the older p4 preset; their tuning knobs differ
                // and we have no machine to validate against right now.
                cmd.add("-preset"); cmd.add("p4");
                cmd.add("-crf"); cmd.add("23");
            }
        }
        // Audio: same independent decision. Most non-native containers carry h264 video + ac3 audio,
        // and audio re-encode is cheap enough that the video can still go through copy.
        if (audioCopy) {
            cmd.add("-c:a"); cmd.add("copy");
        } else {
            cmd.add("-c:a"); cmd.add("aac");
            cmd.add("-b:a"); cmd.add("128k");
        }
        cmd.add("-copyts");
        cmd.add("-muxdelay"); cmd.add("0");
        cmd.add("-muxpreload"); cmd.add("0");
        cmd.add("-flush_packets"); cmd.add("1");
        cmd.add("-f"); cmd.add("mpegts");
        cmd.add("pipe:1");
        return cmd;
    }

    /**
     * Map hwaccel name → x264-compatible encoder. {@code auto} falls back to libx264; the user
     * can be more specific in application.yml when their machine has known acceleration.
     */
    private static String videoEncoderFor(String hwaccel) {
        return switch (hwaccel) {
            case "qsv" -> "h264_qsv";
            case "nvenc", "cuda" -> "h264_nvenc";
            case "amf", "d3d11va" -> "h264_amf";
            case "videotoolbox" -> "h264_videotoolbox";
            default -> "libx264";
        };
    }

    private static Thread startStderrDrain(Process process) {
        return Thread.ofVirtual().name("ffmpeg-stderr").start(() -> {
            try (var reader = new BufferedReader(
                    new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    log.debug("[ffmpeg] {}", line);
                }
            } catch (IOException ignored) {
            }
        });
    }

    private static void reap(Process process) {
        try {
            if (!process.waitFor(PROCESS_GRACE_MS, TimeUnit.MILLISECONDS)) {
                process.destroyForcibly();
                if (!process.waitFor(PROCESS_GRACE_MS, TimeUnit.MILLISECONDS)) {
                    log.error("ffmpeg refused to die after destroyForcibly; pid={}", process.pid());
                }
            }
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
        }
    }
}
