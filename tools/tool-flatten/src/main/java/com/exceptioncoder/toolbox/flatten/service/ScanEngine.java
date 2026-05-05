package com.exceptioncoder.toolbox.flatten.service;

import com.exceptioncoder.toolbox.flatten.domain.FlattenFile;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CancellationException;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

@Component("flattenScanEngine")
public class ScanEngine {

    private static final Logger log = LoggerFactory.getLogger(ScanEngine.class);
    private static final int PROGRESS_THROTTLE_MS = 200;

    public Result scan(String scanId,
                       Path source,
                       Consumer<Progress> onProgress,
                       BooleanSupplier cancelled) throws IOException {

        // Pass 1: walk every file, record (path, size, mtime). Skip dirs, skip non-regular.
        List<FlattenFile> files = new ArrayList<>();
        long[] lastProgressAt = { System.currentTimeMillis() };
        long[] runningSize = { 0L };

        Files.walkFileTree(source, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) {
                if (cancelled.getAsBoolean()) throw new CancellationException();
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                if (cancelled.getAsBoolean()) throw new CancellationException();
                if (!attrs.isRegularFile()) return FileVisitResult.CONTINUE;

                long size = attrs.size();
                runningSize[0] += size;
                Path nameP = file.getFileName();
                String name = nameP == null ? file.toString() : nameP.toString();
                files.add(FlattenFile.builder()
                        .scanId(scanId)
                        .path(file.toString())
                        .name(name)
                        .size(size)
                        .modifiedAt(attrs.lastModifiedTime().toMillis())
                        .build());

                long now = System.currentTimeMillis();
                if (now - lastProgressAt[0] >= PROGRESS_THROTTLE_MS) {
                    lastProgressAt[0] = now;
                    onProgress.accept(new Progress(files.size(), 0, runningSize[0], file.toString(), Phase.SCAN));
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException exc) {
                log.debug("visitFileFailed {}: {}", file, exc.toString());
                return FileVisitResult.CONTINUE;
            }
        });

        // Pass 2: bucket by size, hash only buckets ≥ 2.
        Map<Long, List<FlattenFile>> bySize = new HashMap<>();
        for (FlattenFile f : files) {
            bySize.computeIfAbsent(f.getSize(), k -> new ArrayList<>()).add(f);
        }

        long totalSize = runningSize[0];
        int hashed = 0;
        long lastHashProgress = System.currentTimeMillis();
        for (Map.Entry<Long, List<FlattenFile>> e : bySize.entrySet()) {
            List<FlattenFile> bucket = e.getValue();
            if (bucket.size() < 2) continue;
            for (FlattenFile f : bucket) {
                if (cancelled.getAsBoolean()) throw new CancellationException();
                try {
                    f.setHash(HashUtil.md5(Path.of(f.getPath())));
                } catch (IOException ioe) {
                    log.warn("hash failed for {}: {}", f.getPath(), ioe.toString());
                }
                hashed += 1;
                long now = System.currentTimeMillis();
                if (now - lastHashProgress >= PROGRESS_THROTTLE_MS) {
                    lastHashProgress = now;
                    onProgress.accept(new Progress(files.size(), hashed, totalSize, f.getPath(), Phase.HASH));
                }
            }
        }

        return new Result(files, totalSize);
    }

    public enum Phase { SCAN, HASH }

    public record Progress(int scanned, int hashed, long totalSize, String currentPath, Phase phase) {}

    public record Result(List<FlattenFile> files, long totalSize) {}
}
