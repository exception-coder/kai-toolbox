package com.exceptioncoder.toolbox.common.media;

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
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * On-demand 9-grid (or single-frame) JPEG thumbnails for video files. Cached forever to disk;
 * the cache key includes mtime so editing a file naturally invalidates.
 *
 * <p>Concurrency model: a {@link Semaphore} caps how many ffmpeg processes run at once
 * (CPU is the bottleneck, not the JVM thread count). A second map deduplicates concurrent
 * requests for the same key — only the first one shells out, the rest await its result.
 *
 * <p>Failure model: a {@code .failed} marker file gets written next to the would-be jpeg so
 * that broken / unsupported files don't keep re-forking ffmpeg on every page load.
 */
@Component
public class ThumbnailService {

    private static final Logger log = LoggerFactory.getLogger(ThumbnailService.class);
    private static final String FAILED_SUFFIX = ".failed";

    private final FfmpegProperties ffmpegProps;
    private final ThumbnailProperties props;
    private final FfmpegProbe probe;
    private final FfmpegProcessRegistry registry;

    private Path cacheDir;
    private Semaphore semaphore;
    private final ConcurrentHashMap<String, CompletableFuture<Path>> inFlight = new ConcurrentHashMap<>();

    public ThumbnailService(FfmpegProperties ffmpegProps, ThumbnailProperties props,
                             FfmpegProbe probe, FfmpegProcessRegistry registry) {
        this.ffmpegProps = ffmpegProps;
        this.props = props;
        this.probe = probe;
        this.registry = registry;
    }

    @PostConstruct
    public void init() throws IOException {
        String dir = props.getCacheDir();
        if (dir == null || dir.isBlank()) {
            dir = System.getProperty("user.home") + "/.kai-toolbox/cache/thumbs";
        }
        cacheDir = Path.of(dir);
        Files.createDirectories(cacheDir);
        semaphore = new Semaphore(Math.max(1, props.getMaxParallel()), true);
        log.info("thumbnails cached at {}, maxParallel={}", cacheDir, props.getMaxParallel());

        // Wipe stale .tmp files left behind by a previous JVM that was force-killed mid-write.
        // Without this, every force-kill leaks a handful of half-finished tmp files into the
        // cache that would never be reaped otherwise.
        int wiped = 0;
        try (var stream = Files.newDirectoryStream(cacheDir, "*.tmp")) {
            for (Path tmp : stream) {
                try {
                    Files.deleteIfExists(tmp);
                    wiped++;
                } catch (IOException ignored) {
                }
            }
        }
        if (wiped > 0) log.info("cleaned {} stale .tmp files from previous run", wiped);
    }

    /**
     * Returns the cached jpeg path, generating it if needed. Throws {@link NoSuchFileException}
     * if the source file is gone / ffmpeg fails / the marker file says we already tried.
     */
    public Path getOrGenerate(Path source) throws IOException {
        if (!probe.isFfmpegAvailable()) {
            throw new FfmpegUnavailableException("FFmpeg 不可用");
        }
        if (!Files.isRegularFile(source)) {
            throw new NoSuchFileException(source.toString());
        }
        String key = cacheKey(source);
        Path jpeg = cacheDir.resolve(key + ".jpg");
        Path failedMarker = cacheDir.resolve(key + FAILED_SUFFIX);

        if (Files.isRegularFile(jpeg)) return jpeg;
        if (Files.isRegularFile(failedMarker)) {
            throw new NoSuchFileException("thumbnail previously failed: " + source);
        }

        CompletableFuture<Path> future = inFlight.computeIfAbsent(key, k -> {
            CompletableFuture<Path> f = new CompletableFuture<>();
            // Spawn the actual work on a virtual thread so the caller's HTTP thread isn't held
            // through the semaphore wait + ffmpeg run.
            Thread.ofVirtual().name("thumb-" + k).start(() -> {
                try {
                    Path result = generate(source, jpeg, failedMarker);
                    f.complete(result);
                } catch (Throwable t) {
                    f.completeExceptionally(t);
                } finally {
                    inFlight.remove(k);
                }
            });
            return f;
        });

        try {
            return future.get();
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted while waiting for thumbnail", ie);
        } catch (java.util.concurrent.ExecutionException ee) {
            Throwable cause = ee.getCause();
            if (cause instanceof IOException io) throw io;
            if (cause instanceof RuntimeException re) throw re;
            throw new IOException("thumbnail generation failed", cause);
        }
    }

    private Path generate(Path source, Path jpeg, Path failedMarker) throws IOException {
        try {
            semaphore.acquire();
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted while queuing for thumbnail slot", ie);
        }
        try {
            ProbeResult info = probe.probe(source);
            double duration = info.durationSeconds();
            // Write to a sibling .tmp file then atomic-move so a partial write never gets read.
            Path tmp = jpeg.resolveSibling(jpeg.getFileName() + ".tmp");
            List<String> cmd = buildCommand(source, tmp, duration);
            runFfmpeg(cmd, tmp, source);
            Files.move(tmp, jpeg, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            return jpeg;
        } catch (IOException e) {
            try { Files.write(failedMarker, new byte[0]); } catch (IOException ignored) {}
            throw e;
        } finally {
            semaphore.release();
        }
    }

    private List<String> buildCommand(Path source, Path out, double duration) {
        List<String> cmd = new ArrayList<>();
        cmd.add(ffmpegProps.getBinary());
        cmd.add("-loglevel"); cmd.add("error");
        cmd.add("-nostdin");
        cmd.add("-y");

        if (duration < 5) {
            // Tiny clip: just grab the middle frame, no scene detection needed.
            double midpoint = Math.max(0, duration / 2);
            cmd.add("-ss"); cmd.add(format(midpoint));
            cmd.add("-i"); cmd.add(source.toAbsolutePath().toString());
            cmd.add("-vf"); cmd.add("scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:-1:-1:color=black");
        } else if (duration < 30) {
            // Short clip: one representative frame using the thumbnail filter.
            cmd.add("-i"); cmd.add(source.toAbsolutePath().toString());
            cmd.add("-vf"); cmd.add("thumbnail=200,scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:-1:-1:color=black");
        } else {
            // 9-grid mosaic: skip 5% intro / 5% outro, sample 9 evenly inside the middle 90%.
            double start = duration * 0.05;
            double window = duration * 0.9;
            cmd.add("-ss"); cmd.add(format(start));
            cmd.add("-i"); cmd.add(source.toAbsolutePath().toString());
            cmd.add("-t"); cmd.add(format(window));
            String fps = String.format(Locale.ROOT, "%.6f", 9.0 / window);
            cmd.add("-vf");
            cmd.add("fps=" + fps
                    + ",scale=160:90:force_original_aspect_ratio=decrease"
                    + ",pad=160:90:-1:-1:color=black"
                    + ",tile=3x3");
        }

        cmd.add("-frames:v"); cmd.add("1");
        cmd.add("-update"); cmd.add("1");
        cmd.add("-q:v"); cmd.add(String.valueOf(props.getJpegQuality()));
        // We write to a {@code .tmp} sibling for atomic move, so the path doesn't end in
        // {@code .jpg}. Force the image2 muxer explicitly so ffmpeg doesn't try to infer
        // the format from the extension and bail out with "Unable to choose an output format".
        cmd.add("-f"); cmd.add("image2");
        cmd.add(out.toAbsolutePath().toString());
        return cmd;
    }

    private void runFfmpeg(List<String> cmd, Path tmpOut, Path source) throws IOException {
        Process process = registry.spawn(new ProcessBuilder(cmd).redirectErrorStream(false));

        // BOTH streams drain on background virtual threads. Doing the drain on the caller's
        // thread would block forever if ffmpeg hangs decoding a corrupt file — transferTo only
        // returns at EOF, and EOF only happens when ffmpeg exits, so the wall-clock timeout
        // below would be unreachable. With drains pushed to side threads, the caller is free
        // to enforce {@code waitFor(timeout)} and force-kill on hang.
        Thread stdoutDrain = Thread.ofVirtual().name("thumb-stdout").start(() -> {
            try (var s = process.getInputStream()) {
                s.transferTo(OutputStream.nullOutputStream());
            } catch (IOException ignored) {
            }
        });
        Thread stderrDrain = Thread.ofVirtual().name("thumb-stderr").start(() -> {
            try (var reader = new BufferedReader(
                    new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    log.debug("[ffmpeg-thumb] {}", line);
                }
            } catch (IOException ignored) {
            }
        });

        boolean exited;
        try {
            exited = process.waitFor(props.getTimeoutMs(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
            cleanup(tmpOut);
            throw new IOException("interrupted during thumbnail generation", ie);
        }

        if (!exited) {
            process.destroyForcibly();
            try { process.waitFor(2, TimeUnit.SECONDS); }
            catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            joinDrain(stdoutDrain);
            joinDrain(stderrDrain);
            cleanup(tmpOut);
            throw new IOException("ffmpeg thumbnail timed out for " + source);
        }

        // Streams will EOF promptly now that the process exited.
        joinDrain(stdoutDrain);
        joinDrain(stderrDrain);

        if (process.exitValue() != 0) {
            cleanup(tmpOut);
            throw new IOException("ffmpeg thumbnail exited " + process.exitValue() + " for " + source);
        }
        if (!Files.isRegularFile(tmpOut) || Files.size(tmpOut) == 0) {
            cleanup(tmpOut);
            throw new IOException("ffmpeg produced no thumbnail for " + source);
        }
    }

    private static void joinDrain(Thread t) {
        try { t.join(2000); }
        catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
    }

    private static void cleanup(Path p) {
        try { Files.deleteIfExists(p); } catch (IOException ignored) {}
    }

    private static String cacheKey(Path source) throws IOException {
        String mtime = String.valueOf(Files.getLastModifiedTime(source).toMillis());
        String input = source.toAbsolutePath() + "|" + mtime;
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            return HexFormat.of().formatHex(md.digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-1 unavailable", e);
        }
    }

    private static String format(double seconds) {
        return String.format(Locale.ROOT, "%.3f", seconds);
    }
}
