package com.exceptioncoder.toolbox.common.media;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks every ffmpeg / ffprobe child process spawned by the toolkit so they can be
 * force-killed on JVM shutdown. Without this, child processes outlive the JVM on Windows
 * (and get re-parented to PID 1 on Linux) and continue burning CPU until they finish
 * naturally.
 *
 * <p>Coverage: graceful exits — JVM normal exit, SIGTERM, Spring context close, IDE stop —
 * all fire either the shutdown hook or {@code @PreDestroy}. A {@code kill -9} /
 * {@code taskkill /F} cannot be intercepted by any code; that's an OS-level constraint.
 */
@Component
public class FfmpegProcessRegistry {

    private static final Logger log = LoggerFactory.getLogger(FfmpegProcessRegistry.class);

    private final FfmpegProperties props;
    private final Set<Process> active = ConcurrentHashMap.newKeySet();

    public FfmpegProcessRegistry(FfmpegProperties props) {
        this.props = props;
        Runtime.getRuntime().addShutdownHook(new Thread(this::reapAll, "ffmpeg-reap"));
    }

    /**
     * One-shot orphan reap on startup. Walks every process the OS exposes and force-kills
     * the ones whose command path matches our configured {@code toolbox.ffmpeg.binary} or
     * {@code toolbox.ffmpeg.ffprobe-binary} — those are the ones a previous JVM process must
     * have spawned and that survived a {@code kill -9 / taskkill /F}.
     *
     * <p>Only runs when the configured paths are absolute. A relative name like {@code ffmpeg}
     * could match the user's unrelated concurrent ffmpeg work (different cmd window, video
     * editor, etc.); we skip the reap rather than risk stomping on it.
     */
    @PostConstruct
    void reapStaleOrphansAtStartup() {
        Path ffmpegAbs = absoluteOrNull(props.getBinary());
        Path ffprobeAbs = absoluteOrNull(props.getFfprobeBinary());
        if (ffmpegAbs == null && ffprobeAbs == null) {
            log.debug("ffmpeg/ffprobe paths are relative; skipping startup orphan reap");
            return;
        }
        String ffmpegCanonical = ffmpegAbs == null ? null : canonical(ffmpegAbs);
        String ffprobeCanonical = ffprobeAbs == null ? null : canonical(ffprobeAbs);

        long ourPid = ProcessHandle.current().pid();
        int killed = 0;
        for (ProcessHandle ph : ProcessHandle.allProcesses().toList()) {
            if (ph.pid() == ourPid) continue;
            String cmd = ph.info().command().orElse("");
            if (cmd.isEmpty()) continue;
            String cmdCanonical;
            try {
                cmdCanonical = canonical(Path.of(cmd));
            } catch (InvalidPathException e) {
                continue;
            }
            if (cmdCanonical.equals(ffmpegCanonical) || cmdCanonical.equals(ffprobeCanonical)) {
                log.info("reaping stale orphan: pid={} cmd={}", ph.pid(), cmd);
                ph.destroyForcibly();
                killed++;
            }
        }
        if (killed > 0) {
            log.warn("destroyed {} stale ffmpeg/ffprobe processes from a previous force-killed run", killed);
        }
    }

    private static Path absoluteOrNull(String s) {
        if (s == null || s.isEmpty()) return null;
        try {
            Path p = Path.of(s).normalize();
            return p.isAbsolute() ? p : null;
        } catch (InvalidPathException e) {
            return null;
        }
    }

    /** Lowercase string of an absolute, normalized path — sufficient for case-insensitive Windows match. */
    private static String canonical(Path p) {
        return p.toAbsolutePath().normalize().toString().toLowerCase(Locale.ROOT);
    }

    /**
     * Convenience: start a process and track it in one call. The {@link Process#onExit()}
     * future auto-removes the entry when the process exits naturally, so callers never
     * need to "untrack".
     */
    public Process spawn(ProcessBuilder pb) throws IOException {
        return track(pb.start());
    }

    public Process track(Process p) {
        active.add(p);
        p.onExit().whenComplete((res, ex) -> active.remove(p));
        return p;
    }

    @PreDestroy
    void onContextClose() {
        reapAll();
    }

    private void reapAll() {
        if (active.isEmpty()) return;
        int n = active.size();
        log.info("force-killing {} live ffmpeg/ffprobe processes on shutdown", n);
        for (Process p : active) {
            try {
                // Catches the rare case where the spawned binary itself forked helpers.
                p.descendants().forEach(ProcessHandle::destroyForcibly);
                p.destroyForcibly();
            } catch (Exception ignored) {
            }
        }
        active.clear();
    }
}
