package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.exceptioncoder.toolbox.treesize.domain.FileNode;
import com.exceptioncoder.toolbox.treesize.domain.ScanRecord;
import com.exceptioncoder.toolbox.treesize.domain.ScanSourceType;
import com.exceptioncoder.toolbox.treesize.domain.ScanStatus;
import com.exceptioncoder.toolbox.treesize.domain.SshHost;
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
import java.util.concurrent.locks.ReentrantLock;

@Service
public class ScanService {

    private static final Logger log = LoggerFactory.getLogger(ScanService.class);
    private static final int BATCH_SIZE = 1000;

    private final ScanEngine engine;
    private final RemoteScanEngine remoteEngine;
    private final ScanRepository scans;
    private final NodeRepository nodes;
    private final SseEmitterRegistry sse;
    private final SshHostService sshHosts;
    private final TaskBroadcaster taskBroadcaster;
    private final TaskAssembler taskAssembler;

    private final ExecutorService executor = Executors.newThreadPerTaskExecutor(
            Thread.ofVirtual().name("treesize-scan-", 0).factory()
    );
    private final ConcurrentHashMap<String, AtomicBoolean> cancelFlags = new ConcurrentHashMap<>();

    /**
     * 删除扫描记录的串行化锁：多次连击删除时在 Java 层排队，避免在 SQLite 层
     * 用 busy_timeout 轮询抢锁。配合 ScanRepository.deleteById 的 @Transactional
     * 一并把写锁竞争压缩到最小。
     */
    private final ReentrantLock deletionLock = new ReentrantLock();

    public ScanService(ScanEngine engine,
                       RemoteScanEngine remoteEngine,
                       ScanRepository scans,
                       NodeRepository nodes,
                       SseEmitterRegistry sse,
                       SshHostService sshHosts,
                       TaskBroadcaster taskBroadcaster,
                       TaskAssembler taskAssembler) {
        this.engine = engine;
        this.remoteEngine = remoteEngine;
        this.scans = scans;
        this.nodes = nodes;
        this.sse = sse;
        this.sshHosts = sshHosts;
        this.taskBroadcaster = taskBroadcaster;
        this.taskAssembler = taskAssembler;
    }

    /** 任务中心专用广播：以 ScanRecord 当前状态向全局多订阅频道推一份 TaskView。 */
    private void broadcastTask(ScanRecord record) {
        taskBroadcaster.broadcast(taskAssembler.from(record));
    }

    /** 取最新的 ScanRecord 再广播（多线程改完字段后 DB 才是最权威的）。 */
    private void broadcastTaskById(String scanId) {
        scans.findById(scanId).ifPresent(this::broadcastTask);
    }

    public ScanRecord startScan(String rootPath) {
        return startLocalScan(rootPath);
    }

    public ScanRecord startScan(String rootPath, ScanSourceType sourceType, String sshHostId) {
        if (sourceType == ScanSourceType.SSH) {
            return startSshScan(rootPath, sshHostId);
        }
        return startLocalScan(rootPath);
    }

    private ScanRecord startLocalScan(String rootPath) {
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
                .sourceType(ScanSourceType.LOCAL_WINDOWS)
                .sourceDisplayName("本地 Windows")
                .startedAt(System.currentTimeMillis())
                .build();
        scans.insert(record);
        // 任务中心：扫描刚入库就广播一行 RUNNING,前端列表立刻可见。
        broadcastTask(record);

        AtomicBoolean cancelled = new AtomicBoolean(false);
        cancelFlags.put(id, cancelled);

        executor.submit(() -> runScan(id, root, cancelled));
        return record;
    }

    private ScanRecord startSshScan(String rootPath, String sshHostId) {
        if (sshHostId == null || sshHostId.isBlank()) {
            throw new IllegalArgumentException("sshHostId is required for SSH scans");
        }
        SshHost host = sshHosts.findRequired(sshHostId);
        String id = UUID.randomUUID().toString();
        ScanRecord record = ScanRecord.builder()
                .id(id)
                .rootPath(rootPath)
                .status(ScanStatus.RUNNING)
                .sourceType(ScanSourceType.SSH)
                .sshHostId(host.getId())
                .sourceDisplayName(host.getName() + " (" + host.label() + ")")
                .startedAt(System.currentTimeMillis())
                .build();
        scans.insert(record);
        broadcastTask(record);

        AtomicBoolean cancelled = new AtomicBoolean(false);
        cancelFlags.put(id, cancelled);

        executor.submit(() -> runSshScan(id, host, rootPath, cancelled));
        return record;
    }

    public void cancel(String id) {
        AtomicBoolean flag = cancelFlags.get(id);
        if (flag != null) flag.set(true);
    }

    /**
     * 删除扫描历史的统一入口：先取消（如果在跑），再在 JVM 单一互斥下顺序提交
     * SQLite 删除事务。两次并发请求会在 deletionLock 上排队而不是在 SQLite
     * busy_timeout 上轮询，配合 ScanRepository.deleteById 的事务合并把写锁
     * 抢占次数压到每次 1 次。
     */
    public void deleteAndStop(String id) {
        cancel(id);
        deletionLock.lock();
        try {
            scans.deleteById(id);
        } finally {
            deletionLock.unlock();
        }
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
            // A scan just inserted thousands of rows — the cached video-library count is stale.
            nodes.invalidateVideoLibraryCache();
            sse.publish(id, "completed", java.util.Map.of(
                    "totalFiles", totals.files(),
                    "totalDirs", totals.dirs(),
                    "totalSize", totals.size()
            ));
            broadcastTaskById(id);
        } catch (CancellationException ce) {
            flushSilently(buffer);
            scans.updateStatus(id, ScanStatus.CANCELLED, System.currentTimeMillis(), null);
            sse.publish(id, "cancelled", java.util.Map.of("scanId", id));
            broadcastTaskById(id);
        } catch (Exception e) {
            log.error("scan {} failed", id, e);
            flushSilently(buffer);
            scans.updateStatus(id, ScanStatus.FAILED, System.currentTimeMillis(), e.getMessage());
            sse.publish(id, "error", java.util.Map.of("message", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
            broadcastTaskById(id);
        } finally {
            cancelFlags.remove(id);
            sse.complete(id);
        }
    }

    private void runSshScan(String id, SshHost host, String rootPath, AtomicBoolean cancelled) {
        List<FileNode> buffer = new ArrayList<>(BATCH_SIZE);
        try {
            ScanEngine.Totals totals = remoteEngine.scan(
                    id,
                    host,
                    rootPath,
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
            // A scan just inserted thousands of rows — the cached video-library count is stale.
            nodes.invalidateVideoLibraryCache();
            sse.publish(id, "completed", java.util.Map.of(
                    "totalFiles", totals.files(),
                    "totalDirs", totals.dirs(),
                    "totalSize", totals.size()
            ));
            broadcastTaskById(id);
        } catch (CancellationException ce) {
            flushSilently(buffer);
            scans.updateStatus(id, ScanStatus.CANCELLED, System.currentTimeMillis(), null);
            sse.publish(id, "cancelled", java.util.Map.of("scanId", id));
            broadcastTaskById(id);
        } catch (Exception e) {
            log.error("ssh scan {} failed for {}", id, host.label(), e);
            flushSilently(buffer);
            scans.updateStatus(id, ScanStatus.FAILED, System.currentTimeMillis(), e.getMessage());
            sse.publish(id, "error", java.util.Map.of("message", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
            broadcastTaskById(id);
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
