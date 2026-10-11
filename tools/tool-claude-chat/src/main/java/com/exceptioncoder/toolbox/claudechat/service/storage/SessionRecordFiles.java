package com.exceptioncoder.toolbox.claudechat.service.storage;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 受限、只读的文件定位缓存；只缓存路径，字节数始终重新读取。 */
final class SessionRecordFiles {
    private static final int MAX_CACHE_ROOTS = 32;
    private static final int MAX_ENTRIES = 20_000;
    private static final long CACHE_MILLIS = 30_000;
    private static final long MAX_SCAN_NANOS = 1_000_000_000L;
    private final Map<Key, CachedScan> cache = new LinkedHashMap<>();

    synchronized Scan cached(Path root, int depth) {
        Key key = new Key(root.toAbsolutePath().normalize(), depth);
        long now = System.currentTimeMillis();
        CachedScan previous = cache.get(key);
        if (previous != null && now - previous.createdAt() < CACHE_MILLIS) {
            return previous.scan();
        }
        Scan current = scan(key.root(), depth, false);
        cache.put(key, new CachedScan(now, current));
        while (cache.size() > MAX_CACHE_ROOTS) {
            cache.remove(cache.keySet().iterator().next());
        }
        return current;
    }

    Scan scan(Path root, int depth) {
        return scan(root, depth, true);
    }

    private Scan scan(Path root, int depth, boolean reportDepthLimit) {
        if (!Files.exists(root)) {
            return new Scan(List.of(), true);
        }
        try {
            Path realRoot = root.toRealPath();
            BoundedVisitor visitor = new BoundedVisitor(root.toAbsolutePath().normalize(), realRoot, reportDepthLimit);
            Files.walkFileTree(root, java.util.Set.of(), depth, visitor);
            return new Scan(List.copyOf(visitor.files), visitor.complete);
        } catch (IOException | SecurityException exception) {
            return new Scan(List.of(), false);
        }
    }

    /** 每个候选必须以真实路径重新校验，不允许目录 Junction 或文件链接越界。 */
    static Path contained(Path root, Path candidate) throws IOException {
        Path realRoot = root.toRealPath();
        Path realFile = candidate.toRealPath();
        Path expected = realRoot.resolve(root.toAbsolutePath().normalize()
                .relativize(candidate.toAbsolutePath().normalize())).normalize();
        if (!realFile.startsWith(realRoot) || !realFile.equals(expected) || !Files.isRegularFile(realFile)) {
            throw new IOException("会话记录路径不在引擎存储根内");
        }
        return realFile;
    }

    record Scan(List<Path> files, boolean complete) { }
    private record Key(Path root, int depth) { }
    private record CachedScan(long createdAt, Scan scan) { }

    private static final class BoundedVisitor extends SimpleFileVisitor<Path> {
        private final Path realRoot;
        private final Path root;
        private final boolean reportDepthLimit;
        private final long started = System.nanoTime();
        private final List<Path> files = new ArrayList<>();
        private int entries;
        private boolean complete = true;

        private BoundedVisitor(Path root, Path realRoot, boolean reportDepthLimit) {
            this.root = root;
            this.realRoot = realRoot;
            this.reportDepthLimit = reportDepthLimit;
        }

        private boolean inBudget() {
            boolean allowed = ++entries <= MAX_ENTRIES && System.nanoTime() - started < MAX_SCAN_NANOS;
            complete &= allowed;
            return allowed;
        }

        @Override
        public FileVisitResult preVisitDirectory(Path directory, BasicFileAttributes attributes) throws IOException {
            if (!inBudget()) {
                return FileVisitResult.TERMINATE;
            }
            if (!directory.toRealPath().equals(realRoot.resolve(root.relativize(directory.toAbsolutePath())))) {
                complete = false;
                return FileVisitResult.SKIP_SUBTREE;
            }
            return FileVisitResult.CONTINUE;
        }

        @Override
        public FileVisitResult visitFile(Path file, BasicFileAttributes attributes) {
            if (!inBudget()) {
                return FileVisitResult.TERMINATE;
            }
            if (attributes.isRegularFile() || attributes.isSymbolicLink()) {
                files.add(file);
            } else if (attributes.isDirectory() && reportDepthLimit) {
                complete = false;
            }
            return FileVisitResult.CONTINUE;
        }

        @Override
        public FileVisitResult visitFileFailed(Path file, IOException exception) {
            complete = false;
            return inBudget() ? FileVisitResult.CONTINUE : FileVisitResult.TERMINATE;
        }

        @Override
        public FileVisitResult postVisitDirectory(Path directory, IOException exception) {
            complete &= exception == null;
            return FileVisitResult.CONTINUE;
        }
    }
}
