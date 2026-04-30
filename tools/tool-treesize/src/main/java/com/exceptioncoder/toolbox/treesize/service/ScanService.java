package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.exceptioncoder.toolbox.treesize.domain.FileNode;
import com.exceptioncoder.toolbox.treesize.domain.ScanRecord;
import com.exceptioncoder.toolbox.treesize.domain.ScanStatus;
import com.exceptioncoder.toolbox.treesize.repository.NodeRepository;
import com.exceptioncoder.toolbox.treesize.repository.ScanRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class ScanService {

    private static final Logger log = LoggerFactory.getLogger(ScanService.class);
    private static final int BATCH_SIZE = 1000;

    private final ScanEngine engine;
    private final ScanRepository scans;
    private final NodeRepository nodes;
    private final SseEmitterRegistry sse;

    private final ExecutorService executor = Executors.newThreadPerTaskExecutor(
            Thread.ofVirtual().name("treesize-scan-", 0).factory()
    );
    private final ConcurrentHashMap<String, AtomicBoolean> cancelFlags = new ConcurrentHashMap<>();

    public ScanService(ScanEngine engine, ScanRepository scans, NodeRepository nodes, SseEmitterRegistry sse) {
        this.engine = engine;
        this.scans = scans;
        this.nodes = nodes;
        this.sse = sse;
    }

    public ScanRecord startScan(String rootPath) {
        Path root = Paths.get(rootPath);
        if (!Files.exists(root)) {
            throw new IllegalArgumentException("path not found: " + rootPath);
        }
        if (!Files.isDirectory(root)) {
            throw new IllegalArgumentException("path is not a directory: " + rootPath);
        }

        String id = UUID.randomUUID().toString();
        ScanRecord record = ScanRecord.builder()
                .id(id)
                .rootPath(root.toAbsolutePath().toString())
                .status(ScanStatus.RUNNING)
                .startedAt(System.currentTimeMillis())
                .build();
        scans.insert(record);

        AtomicBoolean cancelled = new AtomicBoolean(false);
        cancelFlags.put(id, cancelled);

        executor.submit(() -> runScan(id, root, cancelled));
        return record;
    }

    public void cancel(String id) {
        AtomicBoolean flag = cancelFlags.get(id);
        if (flag != null) flag.set(true);
    }

    private void runScan(String id, Path root, AtomicBoolean cancelled) {
        List<FileNode> buffer = new ArrayList<>(BATCH_SIZE);
        try {
            ScanEngine.Totals totals = engine.scan(
                    id,
                    root,
                    node -> {
                        buffer.add(node);
                        if (buffer.size() >= BATCH_SIZE) {
                            nodes.batchInsert(buffer);
                            buffer.clear();
                        }
                    },
                    progress -> sse.publish(id, "progress", progress),
                    cancelled::get
            );
            if (!buffer.isEmpty()) {
                nodes.batchInsert(buffer);
                buffer.clear();
            }

            scans.updateTotals(id, totals.files(), totals.dirs(), totals.size());
            scans.updateStatus(id, ScanStatus.COMPLETED, System.currentTimeMillis(), null);
            sse.publish(id, "completed", java.util.Map.of(
                    "totalFiles", totals.files(),
                    "totalDirs", totals.dirs(),
                    "totalSize", totals.size()
            ));
        } catch (CancellationException ce) {
            flushSilently(buffer);
            scans.updateStatus(id, ScanStatus.CANCELLED, System.currentTimeMillis(), null);
            sse.publish(id, "cancelled", java.util.Map.of("scanId", id));
        } catch (Exception e) {
            log.error("scan {} failed", id, e);
            flushSilently(buffer);
            scans.updateStatus(id, ScanStatus.FAILED, System.currentTimeMillis(), e.getMessage());
            sse.publish(id, "error", java.util.Map.of("message", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
        } finally {
            cancelFlags.remove(id);
            sse.complete(id);
        }
    }

    private void flushSilently(List<FileNode> buffer) {
        try {
            if (!buffer.isEmpty()) {
                nodes.batchInsert(buffer);
                buffer.clear();
            }
        } catch (Exception ignored) {
            // best effort
        }
    }
}
