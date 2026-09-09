package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import com.exceptioncoder.toolbox.projects.registry.domain.DomainKnowledge.Run;
import com.exceptioncoder.toolbox.projects.registry.domain.DomainKnowledge.Snapshot;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;

/** 项目内单一领域快照；跨进程锁与原子替换保护上一版可用结果。 */
@Component
public class DomainSnapshotStore {
    private final ObjectMapper json;

    public DomainSnapshotStore(ObjectMapper json) { this.json = json; }

    public Snapshot snapshot(String root) { return read(root, "snapshot.json", Snapshot.class); }
    public Run run(String root) { return read(root, "run.json", Run.class); }
    public void saveSnapshot(String root, Snapshot snapshot) { write(root, "snapshot.json", snapshot); }
    public void saveRun(String root, Run run) { write(root, "run.json", run); }

    public Lease tryLock(String root) {
        try {
            FileChannel channel = FileChannel.open(directory(root, true).resolve("exploration.lock"),
                    StandardOpenOption.CREATE, StandardOpenOption.WRITE, java.nio.file.LinkOption.NOFOLLOW_LINKS);
            try {
                FileLock lock = channel.tryLock();
                if (lock != null) { return new Lease(channel, lock); }
            } catch (OverlappingFileLockException ignored) {
                // 同一 JVM 已持有文件锁，仍按项目忙碌处理。
            }
            channel.close();
            return null;
        } catch (IOException exception) {
            throw new IllegalStateException("无法锁定项目领域目录", exception);
        }
    }

    private <T> T read(String root, String name, Class<T> type) {
        try {
            Path file = directory(root, false).resolve(name);
            if (!Files.exists(file)) { return null; }
            if (Files.isSymbolicLink(file) || Files.size(file) > 2 * 1024 * 1024) {
                throw new IllegalStateException("领域记录路径异常或超过 2 MiB，请检查 .forge/domains");
            }
            return json.readValue(file.toFile(), type);
        } catch (IOException exception) {
            throw new IllegalStateException("无法读取领域记录，请检查 .forge/domains", exception);
        }
    }

    private void write(String root, String name, Object value) {
        Path temporary = null;
        try {
            Path directory = directory(root, true);
            byte[] bytes = json.writeValueAsBytes(value);
            if (bytes.length > 2 * 1024 * 1024) { throw new IllegalArgumentException("领域记录超过 2 MiB"); }
            temporary = Files.createTempFile(directory, ".publishing-", ".json");
            Files.write(temporary, bytes);
            Files.move(temporary, directory.resolve(name), StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException exception) {
            throw new IllegalStateException("领域记录发布失败，上一版快照保留", exception);
        } finally {
            if (temporary != null) {
                try { Files.deleteIfExists(temporary); } catch (IOException ignored) { /* 留待人工检查临时文件。 */ }
            }
        }
    }

    private Path directory(String root, boolean create) throws IOException {
        Path base = Path.of(root).toRealPath();
        Path target = base;
        for (String segment : new String[]{".forge", "domains"}) {
            target = target.resolve(segment);
            if (Files.isSymbolicLink(target)) { throw new IOException("领域目录不能是符号链接"); }
            if (create && !Files.exists(target)) { Files.createDirectory(target); }
            if (Files.exists(target) && !target.toRealPath().startsWith(base)) {
                throw new IOException("领域目录必须位于当前项目内");
            }
        }
        return target;
    }

    public record Lease(FileChannel channel, FileLock lock) implements AutoCloseable {
        @Override public void close() {
            try { lock.release(); } catch (IOException ignored) { /* 关闭 channel 仍会释放锁。 */ }
            try { channel.close(); } catch (IOException ignored) { /* 不覆盖任务本身的结果。 */ }
        }
    }
}
