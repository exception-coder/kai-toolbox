package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.config.VideoExtensionsProperties;
import com.exceptioncoder.toolbox.treesize.domain.VideoScanRoot;
import com.exceptioncoder.toolbox.treesize.repository.VideoScanRootRepository;
import com.exceptioncoder.toolbox.treesize.repository.VideoTableRepository;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** 只索引视频文件的独立渐进扫描用例。 */
@Service
public class VideoDirectoryScanService {
    private static final int BATCH_SIZE = 500;
    private final VideoScanRootRepository roots;
    private final VideoTableRepository videos;
    private final Set<String> extensions;
    private final ExecutorService executor = Executors.newThreadPerTaskExecutor(Thread.ofVirtual().name("video-scan-", 0).factory());
    private final AtomicBoolean running = new AtomicBoolean();
    private final AtomicBoolean cancelled = new AtomicBoolean();

    public VideoDirectoryScanService(VideoScanRootRepository roots, VideoTableRepository videos,
                                     VideoExtensionsProperties properties) {
        this.roots = roots; this.videos = videos;
        this.extensions = new HashSet<>(properties.getExtensions().stream().map(e -> e.toLowerCase(Locale.ROOT)).toList());
    }

    public VideoScanRoot addRoot(String rawPath) throws IOException {
        Path path = Path.of(rawPath).toRealPath();
        if (!Files.isDirectory(path)) throw new IllegalArgumentException("path is not a directory: " + rawPath);
        long now = System.currentTimeMillis();
        VideoScanRoot root = new VideoScanRoot(UUID.randomUUID().toString(), path.toString(), true, null, 0, 0, "IDLE", null);
        roots.insert(root, now); return root;
    }

    public List<VideoScanRoot> listRoots() { return roots.findAll(); }
    public void removeRoot(String id) { roots.delete(id); }
    public boolean isRunning() { return running.get(); }

    public boolean start() {
        if (!running.compareAndSet(false, true)) return false;
        cancelled.set(false); executor.submit(this::scanAll); return true;
    }

    public void stop() { cancelled.set(true); }

    private void scanAll() {
        try { for (VideoScanRoot root : roots.findAll()) { if (!root.enabled() || cancelled.get()) break; scanRoot(root); } }
        finally { running.set(false); }
    }

    private void scanRoot(VideoScanRoot root) {
        long started = System.currentTimeMillis(); roots.markRunning(root.id(), started);
        List<VideoTableRepository.ScannedVideo> batch = new ArrayList<>(BATCH_SIZE);
        long[] totals = new long[2];
        try {
            Files.walkFileTree(Path.of(root.path()), new SimpleFileVisitor<>() {
                @Override public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                    if (cancelled.get()) return FileVisitResult.TERMINATE;
                    String name = file.getFileName().toString(); int dot = name.lastIndexOf('.');
                    String ext = dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
                    if (!extensions.contains(ext) || attrs.size() < 30L * 1024) return FileVisitResult.CONTINUE;
                    batch.add(new VideoTableRepository.ScannedVideo(file.toAbsolutePath().normalize().toString(), name,
                            file.getParent().toString(), ext, attrs.size())); totals[0]++; totals[1] += attrs.size();
                    if (batch.size() >= BATCH_SIZE) flush(root.id(), batch, started);
                    return FileVisitResult.CONTINUE;
                }
                @Override public FileVisitResult visitFileFailed(Path file, IOException error) { return FileVisitResult.CONTINUE; }
            });
            flush(root.id(), batch, started);
            if (!cancelled.get()) { videos.deleteMissingFromRoot(root.id(), started); roots.markDone(root.id(), totals[0], totals[1], System.currentTimeMillis()); }
        } catch (Exception e) { roots.markFailed(root.id(), e.getMessage(), System.currentTimeMillis()); }
    }

    private void flush(String rootId, List<VideoTableRepository.ScannedVideo> batch, long seenAt) {
        if (batch.isEmpty()) return; videos.upsertScannedBatch(rootId, List.copyOf(batch), seenAt); batch.clear();
    }
}
