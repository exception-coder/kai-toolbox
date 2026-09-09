package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import java.io.IOException;
import java.nio.file.*;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

/** 候选产物发布；外部图谱变化时拒绝覆盖，普通写入失败时恢复原文件。 */
final class GraphifyPublication {
    private static final List<String> ARTIFACTS = List.of("graph.json", "manifest.json", ".forge-source-fingerprint", ".graphify_build.json");
    private final Path output;
    private final Map<String, String> digests = new HashMap<>();

    GraphifyPublication(Path output) throws IOException {
        this.output = output;
        for (String name : ARTIFACTS) {
            digests.put(name, digest(output.resolve(name)));
        }
    }

    void publish(Path stage, String fingerprint, boolean noChanges) throws IOException {
        for (String name : ARTIFACTS) {
            if (!Objects.equals(digests.get(name), digest(output.resolve(name)))) {
                throw new IllegalStateException("图谱被其他进程更新，候选结果未发布，请重试");
            }
        }
        Path backup = Files.createDirectory(stage.resolve("rollback"));
        for (String name : ARTIFACTS) {
            if (Files.exists(output.resolve(name))) {
                Files.copy(output.resolve(name), backup.resolve(name), StandardCopyOption.COPY_ATTRIBUTES);
            }
        }
        List<String> written = new ArrayList<>();
        try {
            if (!noChanges) {
                publishFile(stage.resolve("graph.json"), "graph.json", written);
            }
            publishFile(stage.resolve("manifest.json"), "manifest.json", written);
            publishFile(stage.resolve(".graphify_build.json"), ".graphify_build.json", written);
            Files.writeString(stage.resolve(".forge-source-fingerprint"), fingerprint + ":"
                    + Files.getLastModifiedTime(output.resolve("graph.json")).toMillis());
            publishFile(stage.resolve(".forge-source-fingerprint"), ".forge-source-fingerprint", written);
        } catch (IOException | RuntimeException failure) {
            Collections.reverse(written);
            for (String name : written) {
                if (Files.exists(backup.resolve(name))) {
                    Files.copy(backup.resolve(name), output.resolve(name), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.COPY_ATTRIBUTES);
                } else {
                    Files.deleteIfExists(output.resolve(name));
                }
            }
            throw failure;
        }
    }

    private void publishFile(Path source, String name, List<String> written) throws IOException {
        if (Files.size(source) > 128L * 1024 * 1024) {
            throw new IllegalStateException("候选图谱超过 128 MiB 上限，未发布");
        }
        Path pending = Files.createTempFile(output, ".forge-publish-", ".tmp");
        try {
            Files.copy(source, pending, StandardCopyOption.REPLACE_EXISTING);
            Files.move(pending, output.resolve(name), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            written.add(name);
        } finally {
            Files.deleteIfExists(pending);
        }
    }

    void copyCache(Path stage) throws IOException {
        Path source = stage.resolve("cache/ast");
        if (!Files.isDirectory(source)) {
            return;
        }
        long bytes = 0;
        try (var paths = Files.walk(source)) {
            for (Path path : paths.filter(Files::isRegularFile).limit(10000).toList()) {
                bytes += Files.size(path);
                if (bytes > 256L * 1024 * 1024) {
                    break;
                }
                Path target = output.resolve("cache/ast").resolve(source.relativize(path));
                for (Path parent = target; parent != null && parent.startsWith(output); parent = parent.getParent()) {
                    if (Files.isSymbolicLink(parent)) {
                        throw new IOException("AST 缓存目录存在符号链接");
                    }
                }
                Files.createDirectories(target.getParent());
                Files.copy(path, target, StandardCopyOption.REPLACE_EXISTING);
            }
        }
    }

    private String digest(Path path) throws IOException {
        if (Files.isSymbolicLink(path)) {
            throw new IllegalStateException("图谱产物不能是符号链接");
        }
        if (!Files.exists(path)) {
            return "absent";
        }
        if (Files.size(path) > 128L * 1024 * 1024) {
            throw new IllegalStateException("图谱产物超过 128 MiB 安全上限");
        }
        try (var stream = Files.newInputStream(path)) {
            var hash = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[65536];
            int count;
            while ((count = stream.read(buffer)) != -1) {
                hash.update(buffer, 0, count);
            }
            return HexFormat.of().formatHex(hash.digest());
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    static void removeStage(Path stage) throws IOException {
        try (var files = Files.walk(stage)) {
            for (Path path : files.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }
}
