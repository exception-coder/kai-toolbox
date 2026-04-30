package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.domain.FileNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.CancellationException;
import java.util.function.Consumer;

@Component
public class ScanEngine {

    private static final Logger log = LoggerFactory.getLogger(ScanEngine.class);
    private static final int PROGRESS_THROTTLE_MS = 200;

    /**
     * 同步遍历 {@code root}。每访问一个文件/目录调用 {@code onNode}；
     * 节流的进度回调通过 {@code onProgress} 推送（避免事件风暴）。
     * {@code cancelled} 在每次 visit 前检查，触发 {@link CancellationException}。
     */
    public Totals scan(String scanId,
                       Path root,
                       Consumer<FileNode> onNode,
                       Consumer<ScanProgress> onProgress,
                       java.util.function.BooleanSupplier cancelled) throws IOException {

        Deque<DirAccum> stack = new ArrayDeque<>();
        Counters counters = new Counters();
        long[] lastProgressAt = { System.currentTimeMillis() };

        Files.walkFileTree(root, new SimpleFileVisitor<>() {

            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                if (cancelled.getAsBoolean()) throw new CancellationException();
                stack.push(new DirAccum(dir, stack.size()));
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                if (cancelled.getAsBoolean()) throw new CancellationException();
                long size = attrs.size();
                DirAccum top = stack.peek();
                if (top != null) {
                    top.size += size;
                    top.fileCount += 1;
                }
                counters.files += 1;
                counters.size += size;

                FileNode node = FileNode.builder()
                        .scanId(scanId)
                        .parentPath(top == null ? null : top.path.toString())
                        .path(file.toString())
                        .name(file.getFileName() == null ? file.toString() : file.getFileName().toString())
                        .dir(false)
                        .size(size)
                        .depth(stack.size())
                        .build();
                onNode.accept(node);

                throttleProgress(file, lastProgressAt, counters, onProgress);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException exc) {
                log.debug("visitFileFailed {}: {}", file, exc.toString());
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult postVisitDirectory(Path dir, IOException exc) {
                DirAccum done = stack.pop();
                counters.dirs += 1;

                FileNode node = FileNode.builder()
                        .scanId(scanId)
                        .parentPath(stack.isEmpty() ? null : stack.peek().path.toString())
                        .path(done.path.toString())
                        .name(done.path.getFileName() == null ? done.path.toString() : done.path.getFileName().toString())
                        .dir(true)
                        .size(done.size)
                        .fileCount(done.fileCount)
                        .dirCount(done.dirCount)
                        .depth(done.depth)
                        .build();
                onNode.accept(node);

                DirAccum parent = stack.peek();
                if (parent != null) {
                    parent.size += done.size;
                    parent.fileCount += done.fileCount;
                    parent.dirCount += done.dirCount + 1;
                }
                throttleProgress(dir, lastProgressAt, counters, onProgress);
                return FileVisitResult.CONTINUE;
            }
        });

        return new Totals(counters.files, counters.dirs, counters.size);
    }

    private static void throttleProgress(Path current, long[] lastAt, Counters c, Consumer<ScanProgress> onProgress) {
        long now = System.currentTimeMillis();
        if (now - lastAt[0] >= PROGRESS_THROTTLE_MS) {
            lastAt[0] = now;
            onProgress.accept(new ScanProgress(c.files + c.dirs, c.size, current.toString()));
        }
    }

    private static final class DirAccum {
        final Path path;
        final int depth;
        long size;
        long fileCount;
        long dirCount;
        DirAccum(Path path, int depth) { this.path = path; this.depth = depth; }
    }

    private static final class Counters {
        long files;
        long dirs;
        long size;
    }

    public record Totals(long files, long dirs, long size) {}
}
