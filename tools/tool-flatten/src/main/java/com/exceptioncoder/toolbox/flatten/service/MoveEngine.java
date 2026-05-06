package com.exceptioncoder.toolbox.flatten.service;

import com.exceptioncoder.toolbox.flatten.domain.FlattenFile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CancellationException;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

@Component
public class MoveEngine {

    private static final Logger log = LoggerFactory.getLogger(MoveEngine.class);
    private static final DateTimeFormatter COLLISION_STAMP =
            DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

    /**
     * Compute the conflict-resolved target name for each file. The {@code used} set is seeded
     * from the actual contents of {@code targetDir} so we never collide with pre-existing files.
     *
     * <p>Idempotent: a previously assigned {@code targetName} is honored only if it is still
     * unique against the current target directory and the names already locked in by earlier
     * entries of {@code active}. Otherwise the entry is re-picked. This makes it safe to re-run
     * right before {@link #move} to defend against target-dir state changes between planning
     * and execution.
     */
    public void planTargetNames(Path targetDir, List<FlattenFile> active) throws IOException {
        if (!Files.exists(targetDir)) {
            Files.createDirectories(targetDir);
        }
        Set<String> used = new HashSet<>();
        try (DirectoryStream<Path> ds = Files.newDirectoryStream(targetDir)) {
            for (Path p : ds) {
                Path name = p.getFileName();
                if (name != null) used.add(name.toString());
            }
        }
        for (FlattenFile f : active) {
            String existing = f.getTargetName();
            if (existing != null && used.add(existing)) {
                continue;
            }
            f.setTargetName(NameConflictResolver.pick(used, f.getName()));
        }
    }

    public Result move(Path targetDir,
                       List<FlattenFile> active,
                       Consumer<Progress> onProgress,
                       BooleanSupplier cancelled) throws IOException {
        if (!Files.exists(targetDir)) {
            Files.createDirectories(targetDir);
        }
        int total = active.size();
        int moved = 0;
        for (FlattenFile f : active) {
            if (cancelled.getAsBoolean()) throw new CancellationException();
            Path src = Path.of(f.getPath());
            Path planned = targetDir.resolve(f.getTargetName());
            try {
                Path landed = tryMove(src, planned);
                String landedName = landed.getFileName().toString();
                if (!landedName.equals(f.getTargetName())) {
                    log.warn("move-time collision on {} → renamed to {}", planned, landedName);
                    f.setTargetName(landedName);
                    f.setRenamed(true);
                }
                f.setMoved(true);
                moved += 1;
                onProgress.accept(new Progress(moved, total, f.getTargetName()));
            } catch (IOException e) {
                log.error("failed to move {} → {}: {}", src, planned, e.toString());
                throw e;
            }
        }
        return new Result(moved);
    }

    /**
     * Same-volume rename first; copy-then-delete fallback for cross-volume moves; if the
     * target already exists at move time (planning didn't catch it because the target dir
     * mutated between plan and move) we rewrite the destination to {@code stem_<timestamp>.ext}
     * and retry once. Returns the actual landed path.
     */
    private static Path tryMove(Path src, Path dst) throws IOException {
        try {
            return doMove(src, dst);
        } catch (FileAlreadyExistsException e) {
            return doMove(src, appendCollisionStamp(dst));
        }
    }

    private static Path doMove(Path src, Path dst) throws IOException {
        try {
            Files.move(src, dst);
            return dst;
        } catch (FileAlreadyExistsException e) {
            throw e;
        } catch (IOException ignored) {
            // Likely cross-volume: fall through to copy + delete.
        }
        Files.copy(src, dst, StandardCopyOption.COPY_ATTRIBUTES);
        Files.delete(src);
        return dst;
    }

    /**
     * Insert a timestamp before the extension: {@code 2.flv} → {@code 2_20260505205111432.flv}.
     * The leading dot of dotfiles is treated as part of the stem so {@code .bashrc} stays
     * extension-less and becomes {@code .bashrc_<stamp>}.
     */
    private static Path appendCollisionStamp(Path dst) {
        String name = dst.getFileName().toString();
        int dot = name.lastIndexOf('.');
        String stem = (dot > 0) ? name.substring(0, dot) : name;
        String ext = (dot > 0) ? name.substring(dot) : "";
        return dst.resolveSibling(stem + "_" + LocalDateTime.now().format(COLLISION_STAMP) + ext);
    }

    public record Progress(int moved, int total, String currentFile) {}
    public record Result(int moved) {}
}
