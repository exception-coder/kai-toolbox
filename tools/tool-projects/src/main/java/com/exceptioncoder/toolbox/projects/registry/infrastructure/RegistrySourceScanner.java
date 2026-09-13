package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import com.exceptioncoder.toolbox.projects.registry.domain.ProjectEvidencePort.RepositorySnapshot;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

/** 跳过生成物、依赖与凭据文件，按内容计算可重现的源码指纹。 */
@Component
public class RegistrySourceScanner {
    private static final int FILE_LIMIT = 50000;
    private static final long FILE_SIZE_LIMIT = 128L * 1024 * 1024;
    private static final int DEPTH_LIMIT = 32;
    private static final int GAP_LIMIT = 10;
    private static final int HASH_BUFFER_SIZE = 64 * 1024;
    private static final Set<String> EXCLUDED = Set.of(".git", ".svn", "node_modules", "target", "dist",
            "build", "out", ".idea", ".venv", "venv", "__pycache__", "graphify-out", ".codex-work",
            ".codex-remote-attachments", ".kai-chat-attachments", ".codex-attachments", ".codex", ".claude",
            "outputs", ".forge", ".next", ".gradle", "dist-assistant", "dist-session-client", "dist-pages");
    private static final Set<String> EXTENSIONS = Set.of("java", "ts", "tsx", "js", "jsx", "mjs", "py",
            "dart", "go", "rs", "vue", "sql", "xml", "json", "yaml", "yml", "md", "gradle", "kts", "toml");

    /** @param root 已规范化项目根 @return 有界源码内容指纹与清单。 */
    public RepositorySnapshot scan(Path root) {
        List<Path> files = new ArrayList<>();
        List<String> gaps = new ArrayList<>();
        boolean[] complete = {true};
        try {
            Files.walkFileTree(root, EnumSet.noneOf(FileVisitOption.class), DEPTH_LIMIT, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attributes) {
                    return !dir.equals(root) && EXCLUDED.contains(dir.getFileName().toString())
                            ? FileVisitResult.SKIP_SUBTREE : FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attributes) {
                    if (attributes.isDirectory()) {
                        if (!EXCLUDED.contains(file.getFileName().toString())) {
                            complete[0] = false;
                            recordGap(root, file, "目录深度达到 " + DEPTH_LIMIT + " 层", gaps);
                        }
                    }
                    if (attributes.isRegularFile() && relevant(file)) {
                        if (files.size() >= FILE_LIMIT) {
                            complete[0] = false;
                            recordGap(root, file, "超过 " + FILE_LIMIT + " 个文件", gaps);
                            return FileVisitResult.TERMINATE;
                        }
                        if (attributes.size() > FILE_SIZE_LIMIT) {
                            complete[0] = false;
                            recordGap(root, file, "超过 128 MiB", gaps);
                        } else {
                            files.add(file);
                        }
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException exception) {
                    complete[0] = false;
                    recordGap(root, file, "不可读取", gaps);
                    return FileVisitResult.CONTINUE;
                }
            });
            files.sort(Comparator.comparing(file -> root.relativize(file).toString().replace('\\', '/')));
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            List<String> relative = new ArrayList<>();
            for (Path file : files) {
                String name = root.relativize(file).toString().replace('\\', '/');
                relative.add(name);
                digest.update(name.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                digest.update((byte) 0);
                try {
                    hashContent(file, digest);
                } catch (IOException exception) {
                    complete[0] = false;
                    recordGap(root, file, "内容不可读取或读取期间超过 128 MiB", gaps);
                }
                digest.update((byte) 0);
            }
            return new RepositorySnapshot(HexFormat.of().formatHex(digest.digest()), List.copyOf(relative), complete[0],
                    Map.of("sourceFiles", String.valueOf(files.size()), "scanComplete", String.valueOf(complete[0]),
                            "scanGaps", String.join("；", gaps)));
        } catch (IOException | NoSuchAlgorithmException exception) {
            throw new IllegalStateException("读取项目源码失败，请检查目录权限", exception);
        }
    }

    private void hashContent(Path file, MessageDigest digest) throws IOException {
        try (var input = Files.newInputStream(file)) {
            byte[] buffer = new byte[HASH_BUFFER_SIZE];
            long total = 0;
            int count;
            while ((count = input.read(buffer)) != -1) {
                total += count;
                if (total > FILE_SIZE_LIMIT) {
                    throw new IOException("Source exceeds fingerprint size limit");
                }
                digest.update(buffer, 0, count);
            }
        }
    }

    private void recordGap(Path root, Path file, String reason, List<String> gaps) {
        if (gaps.size() < GAP_LIMIT) {
            gaps.add(root.relativize(file).toString().replace('\\', '/') + "：" + reason);
        }
    }

    private boolean relevant(Path path) {
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        if (name.startsWith(".env") || name.equals("credentials.json") || name.equals("secrets.json")
                || name.equals("auth.json") || name.endsWith("lock.json") || name.equals("package-lock.json")) {
            return false;
        }
        int dot = name.lastIndexOf('.');
        return dot >= 0 && EXTENSIONS.contains(name.substring(dot + 1));
    }
}
