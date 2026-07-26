package com.exceptioncoder.toolbox.treesize.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.FileStore;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * Read-only disk usage analysis that explains drive usage without granting cleanup rights.
 */
@Service
public class DiskUsageAnalysisService {

    private static final Logger log = LoggerFactory.getLogger(DiskUsageAnalysisService.class);
    private static final long SOFTWARE_MIN_BYTES = 100L * 1024 * 1024;
    private static final int SOFTWARE_LIMIT = 30;

    private final TrashBin fileSizer;

    public DiskUsageAnalysisService(TrashBin fileSizer) {
        this.fileSizer = fileSizer;
    }

    public Analysis analyze() {
        Path driveRoot = systemDriveRoot();
        long totalBytes = 0L;
        long freeBytes = 0L;
        try {
            FileStore store = Files.getFileStore(driveRoot);
            totalBytes = store.getTotalSpace();
            freeBytes = store.getUsableSpace();
        } catch (IOException e) {
            log.warn("disk usage: cannot read volume capacity for {}", driveRoot, e);
        }

        List<UsageItem> rootItems = measureChildren(driveRoot, Integer.MAX_VALUE, 0L, "根目录");
        long measuredBytes = rootItems.stream().mapToLong(UsageItem::size).sum();

        Path userHome = Path.of(System.getProperty("user.home"));
        List<Path> appDataRoots = List.of(
                userHome.resolve("AppData").resolve("Local"),
                userHome.resolve("AppData").resolve("Roaming")
        );
        List<UsageItem> softwareItems = new ArrayList<>();
        for (Path appDataRoot : appDataRoots) {
            softwareItems.addAll(measureChildren(
                    appDataRoot,
                    SOFTWARE_LIMIT,
                    SOFTWARE_MIN_BYTES,
                    appDataRoot.getFileName().toString()
            ));
        }
        softwareItems.sort(Comparator.comparingLong(UsageItem::size).reversed());
        if (softwareItems.size() > SOFTWARE_LIMIT) {
            softwareItems = new ArrayList<>(softwareItems.subList(0, SOFTWARE_LIMIT));
        }

        return new Analysis(
                driveRoot.toString(),
                totalBytes,
                Math.max(0L, totalBytes - freeBytes),
                freeBytes,
                measuredBytes,
                rootItems,
                softwareItems
        );
    }

    private List<UsageItem> measureChildren(Path parent, int limit, long minimumBytes, String scope) {
        if (!Files.isDirectory(parent)) {
            return List.of();
        }
        List<Path> children;
        try (var stream = Files.list(parent)) {
            children = stream.toList();
        } catch (IOException | SecurityException e) {
            log.debug("disk usage: cannot list {}: {}", parent, e.toString());
            return List.of();
        }

        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<UsageItem>> futures = children.stream()
                    .map(path -> pool.submit(() -> measure(path, scope)))
                    .toList();
            List<UsageItem> measured = new ArrayList<>(futures.size());
            for (Future<UsageItem> future : futures) {
                try {
                    UsageItem item = future.get();
                    if (item.size() >= minimumBytes) {
                        measured.add(item);
                    }
                } catch (Exception e) {
                    log.debug("disk usage: child measurement failed: {}", e.toString());
                }
            }
            return measured.stream()
                    .sorted(Comparator.comparingLong(UsageItem::size).reversed())
                    .limit(limit)
                    .toList();
        }
    }

    private UsageItem measure(Path path, String scope) {
        return new UsageItem(
                path.getFileName() == null ? path.toString() : path.getFileName().toString(),
                path.toString(),
                scope,
                fileSizer.sizeOf(path),
                Files.isDirectory(path)
        );
    }

    private static Path systemDriveRoot() {
        String systemDrive = System.getenv("SystemDrive");
        if (systemDrive == null || systemDrive.isBlank()) {
            return Path.of("C:\\");
        }
        return Path.of(systemDrive + "\\");
    }

    public record UsageItem(String name, String path, String scope, long size, boolean directory) {}

    public record Analysis(
            String drive,
            long totalBytes,
            long usedBytes,
            long freeBytes,
            long measuredBytes,
            List<UsageItem> rootItems,
            List<UsageItem> softwareItems
    ) {}
}
