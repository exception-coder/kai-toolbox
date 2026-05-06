package com.exceptioncoder.toolbox.common.media;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * FFmpeg availability detection + per-file ffprobe metadata extraction.
 *
 * <p>Startup probe: a single {@code ffmpeg -version} fork; the result drives whether HLS endpoints
 * accept requests at all.
 *
 * <p>Per-file probe: caches by {@code (absolute path, mtime)} via an access-order LRU bounded at
 * 1000 entries. Files mutating mid-cache get a fresh probe automatically because mtime changes
 * the cache key.
 */
@Component
public class FfmpegProbe {

    private static final Logger log = LoggerFactory.getLogger(FfmpegProbe.class);
    private static final int CACHE_LIMIT = 1000;

    private static final Set<String> NATIVE_CONTAINERS = Set.of("mp4", "m4v", "webm", "ogg", "mov");
    private static final Set<String> NATIVE_VIDEO_CODECS = Set.of("h264", "vp8", "vp9", "av1");
    private static final Set<String> NATIVE_AUDIO_CODECS = Set.of("aac", "mp3", "opus", "vorbis", "(none)");

    private final FfmpegProperties props;
    private final FfmpegProcessRegistry registry;
    private final ObjectMapper mapper = new ObjectMapper();

    private volatile boolean ffmpegAvailable;
    private volatile String ffmpegVersion = "";

    private final Map<String, ProbeResult> cache = Collections.synchronizedMap(
            new LinkedHashMap<>(64, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, ProbeResult> eldest) {
                    return size() > CACHE_LIMIT;
                }
            }
    );

    public FfmpegProbe(FfmpegProperties props, FfmpegProcessRegistry registry) {
        this.props = props;
        this.registry = registry;
    }

    @PostConstruct
    public void detect() {
        try {
            Process p = new ProcessBuilder(props.getBinary(), "-version")
                    .redirectErrorStream(true)
                    .start();
            String firstLine;
            try (var reader = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                firstLine = reader.readLine();
            }
            if (!p.waitFor(3, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                ffmpegAvailable = false;
                log.warn("ffmpeg -version timed out, transcode features disabled");
                return;
            }
            if (p.exitValue() == 0 && firstLine != null) {
                ffmpegAvailable = true;
                ffmpegVersion = firstLine.trim();
                log.info("ffmpeg detected: {}", ffmpegVersion);
            } else {
                ffmpegAvailable = false;
                log.warn("ffmpeg returned exit code {} on -version, transcode features disabled", p.exitValue());
            }
        } catch (IOException e) {
            ffmpegAvailable = false;
            log.warn("ffmpeg not found at '{}'; transcode features disabled. Configure toolbox.ffmpeg.binary if needed.",
                    props.getBinary());
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            ffmpegAvailable = false;
        }
    }

    public boolean isFfmpegAvailable() {
        return ffmpegAvailable;
    }

    public String getFfmpegVersion() {
        return ffmpegVersion;
    }

    /**
     * Run ffprobe on a single file; cached. Returns {@link ProbeResult#UNKNOWN} when ffprobe is
     * unavailable, fails, or times out — callers downstream treat UNKNOWN as "must transcode but
     * codec hints are missing", which means the safe re-encode path will be taken.
     */
    public ProbeResult probe(Path file) throws IOException {
        if (!ffmpegAvailable) return ProbeResult.UNKNOWN;
        String key = file.toAbsolutePath() + "|" + Files.getLastModifiedTime(file).toMillis();
        ProbeResult cached = cache.get(key);
        if (cached != null) return cached;

        ProbeResult result = runFfprobe(file);
        cache.put(key, result);
        return result;
    }

    private ProbeResult runFfprobe(Path file) {
        ProcessBuilder pb = new ProcessBuilder(
                props.getFfprobeBinary(),
                "-v", "error",
                "-show_streams",
                "-show_format",
                "-of", "json",
                "-analyzeduration", "5M",
                "-probesize", "5M",
                file.toAbsolutePath().toString()
        );
        Process process;
        try {
            process = registry.spawn(pb);
        } catch (IOException e) {
            log.debug("ffprobe spawn failed for {}: {}", file, e.toString());
            return ProbeResult.UNKNOWN;
        }

        // Drain stderr on a side thread so it can never back-pressure ffprobe.
        Thread stderrDrain = Thread.ofVirtual().name("ffprobe-stderr").start(() -> {
            try (var s = process.getErrorStream()) {
                s.transferTo(OutputStream.nullOutputStream());
            } catch (IOException ignored) {
            }
        });

        // Read JSON on a side thread too. {@code readTree} blocks on EOF, which only happens when
        // ffprobe exits — without separating it, the timeout below is unreachable when ffprobe
        // hangs on a malformed file.
        var jsonRef = new java.util.concurrent.atomic.AtomicReference<JsonNode>();
        Thread stdoutReader = Thread.ofVirtual().name("ffprobe-json").start(() -> {
            try (var in = process.getInputStream()) {
                jsonRef.set(mapper.readTree(in));
            } catch (IOException e) {
                log.debug("ffprobe parse failed for {}: {}", file, e.toString());
            }
        });

        try {
            if (!process.waitFor(props.getProbeTimeoutMs(), TimeUnit.MILLISECONDS)) {
                process.destroyForcibly();
                process.waitFor(2, TimeUnit.SECONDS);
                log.warn("ffprobe timed out for {}", file);
                return ProbeResult.UNKNOWN;
            }
            if (process.exitValue() != 0) {
                return ProbeResult.UNKNOWN;
            }
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
            return ProbeResult.UNKNOWN;
        } finally {
            try { stdoutReader.join(2000); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            try { stderrDrain.join(500); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
        }

        JsonNode root = jsonRef.get();
        if (root == null || root.isMissingNode()) return ProbeResult.UNKNOWN;
        return parse(root);
    }

    private static ProbeResult parse(JsonNode root) {
        double duration = root.path("format").path("duration").asDouble(0);
        String container = root.path("format").path("format_name").asText("unknown");
        String videoCodec = "unknown";
        String audioCodec = "(none)";
        for (JsonNode s : root.path("streams")) {
            String type = s.path("codec_type").asText();
            String codec = s.path("codec_name").asText("unknown").toLowerCase();
            if ("video".equals(type) && "unknown".equals(videoCodec)) {
                videoCodec = codec;
            } else if ("audio".equals(type) && "(none)".equals(audioCodec)) {
                audioCodec = codec;
            }
        }
        return new ProbeResult(duration, container, videoCodec, audioCodec);
    }

    /**
     * True when the browser can decode this directly without re-encoding. Container check
     * splits the ffprobe-style comma list ({@code mov,mp4,m4a,3gp,3g2,mj2}) and matches any token.
     */
    public boolean nativelyPlayable(ProbeResult r) {
        if (r == null || r == ProbeResult.UNKNOWN) return false;
        boolean containerOk = Arrays.stream(r.container().toLowerCase().split(","))
                .anyMatch(NATIVE_CONTAINERS::contains);
        return containerOk
                && NATIVE_VIDEO_CODECS.contains(r.videoCodec().toLowerCase())
                && NATIVE_AUDIO_CODECS.contains(r.audioCodec().toLowerCase());
    }

    /**
     * True when codecs already match what we want to ship inside an HLS mpegts segment, so the
     * segment endpoint can use {@code -c copy} and skip re-encoding (the fast path).
     */
    public boolean canRemuxToMpegTs(ProbeResult r) {
        return canCopyVideo(r) && canCopyAudio(r);
    }

    /** True when the video stream can be remuxed into mpegts without re-encoding. */
    public boolean canCopyVideo(ProbeResult r) {
        if (r == null || r == ProbeResult.UNKNOWN) return false;
        return "h264".equalsIgnoreCase(r.videoCodec());
    }

    /** True when the audio stream can be remuxed into mpegts without re-encoding (or there is none). */
    public boolean canCopyAudio(ProbeResult r) {
        if (r == null || r == ProbeResult.UNKNOWN) return false;
        String a = r.audioCodec().toLowerCase();
        return a.equals("aac") || a.equals("mp3") || a.equals("(none)");
    }
}
