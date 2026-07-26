package com.exceptioncoder.toolbox.treesize.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.awt.Desktop;
import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;

/**
 * Recycle-bin-only deletion for whole files or directory trees.
 *
 * <p>Distinct from {@link FileDeleteService} on two axes, which is why it is a separate
 * component rather than another method there:
 * <ul>
 *   <li>It takes directories. {@code FileDeleteService} finishes with {@link Files#delete},
 *       which cannot remove a non-empty directory — useless for a cache folder.</li>
 *   <li>There is <strong>no permanent-delete fallback</strong>. {@code FileDeleteService}
 *       falls back to a hard delete because it acts on one file the user just picked. Here a
 *       single call can take a multi-gigabyte tree the user only approved <em>by category</em>,
 *       so "recycle bin or nothing" is the correct contract — a failed trash is reported,
 *       never escalated.</li>
 * </ul>
 *
 * <p>Failures are also deliberately <em>not</em> filed into {@link FailedDeleteRegistry}: that
 * ledger's retry path runs {@code FileDeleteService.retryAllFailed()}, which would keep
 * failing forever on a directory entry. Cleanup failures are returned inline instead.
 */
@Component
public class TrashBin {

    private static final Logger log = LoggerFactory.getLogger(TrashBin.class);

    /** Whether this JVM/OS can move anything to the recycle bin at all. */
    public boolean available() {
        return Desktop.isDesktopSupported()
                && Desktop.getDesktop().isSupported(Desktop.Action.MOVE_TO_TRASH);
    }

    /**
     * Move {@code target} (file or directory tree) to the recycle bin.
     *
     * <p>A path that vanished between measurement and deletion counts as success — the goal
     * state is "gone", and something else getting there first is not an error.
     */
    public Result trash(Path target) {
        if (!Files.exists(target)) {
            return Result.success();
        }
        if (!available()) {
            return Result.failure("当前环境不支持回收站（无桌面会话）");
        }
        try {
            if (Desktop.getDesktop().moveToTrash(target.toFile())) {
                return Result.success();
            }
            return Result.failure("系统拒绝移入回收站（文件被占用、回收站已满或该卷未启用回收站）");
        } catch (UnsupportedOperationException | SecurityException e) {
            return Result.failure(e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    /**
     * Recursive size in bytes, skipping anything unreadable.
     *
     * <p>Best-effort by design: a cleanup estimate that throws because one file in %TEMP% is
     * locked would be useless. Symlinks are not followed, so a junction into another tree is
     * counted as ~0 rather than double-counting the target.
     */
    public long sizeOf(Path target) {
        if (!Files.exists(target)) {
            return 0L;
        }
        try {
            if (!Files.isDirectory(target)) {
                return Files.size(target);
            }
        } catch (IOException e) {
            return 0L;
        }
        SizeVisitor visitor = new SizeVisitor();
        try {
            Files.walkFileTree(target, visitor);
        } catch (IOException e) {
            log.debug("devclean: size walk interrupted for {}: {}", target, e.toString());
        }
        return visitor.total;
    }

    private static final class SizeVisitor extends SimpleFileVisitor<Path> {
        private long total;

        @Override
        public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
            if (attrs.isRegularFile()) {
                total += attrs.size();
            }
            return FileVisitResult.CONTINUE;
        }

        @Override
        public FileVisitResult visitFileFailed(Path file, IOException exc) {
            // Locked or permission-denied entries just do not contribute to the estimate.
            return FileVisitResult.CONTINUE;
        }
    }

    public record Result(boolean ok, String reason) {
        static Result success() {
            return new Result(true, null);
        }

        static Result failure(String reason) {
            return new Result(false, reason);
        }
    }
}
