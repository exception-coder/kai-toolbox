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
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

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

    private final FfmpegProbe probe;
    private final FfmpegProperties props;
    private final FfmpegProcessRegistry registry;
    private final PlaybackStatsCollector stats;

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

        long t0 = System.nanoTime();
        long spawnMs = -1L;
        boolean clientDisconnected = false;
        Process process = null;
        Thread stderrDrain = null;
        TimedCountingOutputStream counting = null;

        try {
            List<String> cmd = buildSegmentCommand(file, startSec, dur, videoCopy, audioCopy);
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

    private List<String> buildSegmentCommand(Path file, double startSec, double dur,
                                             boolean videoCopy, boolean audioCopy) {
        List<String> cmd = new ArrayList<>();
        cmd.add(props.getBinary());
        cmd.add("-loglevel"); cmd.add("warning");
        cmd.add("-nostdin");
        // -hwaccel must come BEFORE -i. Empty value = software decode/encode.
        if (!videoCopy && !props.getHwaccel().isEmpty()) {
            cmd.add("-hwaccel"); cmd.add(props.getHwaccel());
        }
        // -ss before -i is the "fast seek" form: ffmpeg seeks via container index instead of decoding
        // up to the offset, which is what makes per-segment transcode latency tolerable.
        cmd.add("-ss"); cmd.add(String.format(Locale.ROOT, "%.3f", startSec));
        cmd.add("-t"); cmd.add(String.format(Locale.ROOT, "%.3f", dur));
        cmd.add("-i"); cmd.add(file.toAbsolutePath().toString());

        // Video: copy if compatible, otherwise re-encode. ultrafast + zerolatency keeps per-segment
        // wall-clock under realtime even for HEVC → H.264 on a CPU encoder.
        if (videoCopy) {
            cmd.add("-c:v"); cmd.add("copy");
        } else {
            cmd.add("-c:v"); cmd.add(videoEncoderFor(props.getHwaccel()));
            if (props.getHwaccel().isEmpty()) {
                cmd.add("-preset"); cmd.add("ultrafast");
                cmd.add("-tune"); cmd.add("zerolatency");
            } else {
                cmd.add("-preset"); cmd.add("p4");
            }
            cmd.add("-crf"); cmd.add("23");
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
