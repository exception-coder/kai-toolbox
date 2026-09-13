package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;

/** 项目知识产物的有界存储、跨进程锁和原子发布。命名空间由代码选择。 */
public class ProjectKnowledgeStore {
    private final ObjectMapper json;
    private final String area;

    protected ProjectKnowledgeStore(ObjectMapper json, String area) {
        if (!java.util.Set.of("domains", "topology").contains(area)) {
            throw new IllegalArgumentException("不支持的知识目录");
        }
        this.json = json;
        this.area = area;
    }

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
            throw new IllegalStateException("无法锁定项目知识目录", exception);
        }
    }

    protected <T> T read(String root, String name, Class<T> type) {
        try {
            Path file = directory(root, false).resolve(name);
            if (!Files.exists(file)) { return null; }
            if (Files.isSymbolicLink(file) || Files.size(file) > 2 * 1024 * 1024) {
                throw new IllegalStateException("知识记录路径异常或超过 2 MiB，请检查项目 .forge 知识目录");
            }
            return json.readValue(file.toFile(), type);
        } catch (IOException exception) {
            throw new IllegalStateException("无法读取知识记录，请检查项目 .forge 知识目录", exception);
        }
    }

    protected void write(String root, String name, Object value) {
        Path temporary = null;
        try {
            Path directory = directory(root, true);
            byte[] bytes = json.writeValueAsBytes(value);
            if (bytes.length > 2 * 1024 * 1024) { throw new IllegalArgumentException("知识记录超过 2 MiB"); }
            temporary = Files.createTempFile(directory, ".publishing-", ".json");
            Files.write(temporary, bytes);
            Files.move(temporary, directory.resolve(name), StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException exception) {
            throw new IllegalStateException("知识记录发布失败，上一版快照保留", exception);
        } finally {
            if (temporary != null) {
                try { Files.deleteIfExists(temporary); } catch (IOException ignored) { /* 留待人工检查临时文件。 */ }
            }
        }
    }

    private Path directory(String root, boolean create) throws IOException {
        Path base = Path.of(root).toRealPath();
        Path target = base;
        for (String segment : new String[]{".forge", area}) {
            target = target.resolve(segment);
            if (Files.isSymbolicLink(target)) { throw new IOException("知识目录不能是符号链接"); }
            if (create && !Files.exists(target)) { Files.createDirectory(target); }
            if (Files.exists(target) && !target.toRealPath().startsWith(base)) {
                throw new IOException("知识目录必须位于当前项目内");
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
