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
    private static final long FILE_SIZE_LIMIT = 2 * 1024 * 1024;
    private static final Set<String> EXCLUDED = Set.of(".git", ".svn", "node_modules", "target", "dist",
            "build", ".idea", ".venv", "venv", "__pycache__", "graphify-out", ".codex-work",
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
            Files.walkFileTree(root, EnumSet.noneOf(FileVisitOption.class), 32, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attributes) {
                    return !dir.equals(root) && EXCLUDED.contains(dir.getFileName().toString())
                            ? FileVisitResult.SKIP_SUBTREE : FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attributes) {
                    if (attributes.isDirectory()) {
                        complete[0] = false;
                    }
                    if (attributes.isRegularFile() && relevant(file)) {
                        if (files.size() >= FILE_LIMIT) {
                            complete[0] = false;
                            return FileVisitResult.TERMINATE;
                        }
                        if (attributes.size() > FILE_SIZE_LIMIT) {
                            complete[0] = false;
                            if (gaps.size() < 10) {
                                gaps.add(root.relativize(file) + "：超过 2 MiB");
                            }
                        } else {
                            files.add(file);
                        }
                    }
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult visitFileFailed(Path file, IOException exception) {
                    complete[0] = false;
                    if (gaps.size() < 10) {
                        gaps.add(root.relativize(file) + "：不可读取");
                    }
                    return FileVisitResult.CONTINUE;
                }
            });
            files.sort(Comparator.comparing(Path::toString));
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            List<String> relative = new ArrayList<>();
            for (Path file : files) {
                String name = root.relativize(file).toString().replace('\\', '/');
                relative.add(name);
                digest.update(name.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                digest.update((byte) 0);
                digest.update(Files.readAllBytes(file));
                digest.update((byte) 0);
            }
            return new RepositorySnapshot(HexFormat.of().formatHex(digest.digest()), List.copyOf(relative), complete[0],
                    Map.of("sourceFiles", String.valueOf(files.size()), "scanComplete", String.valueOf(complete[0]),
                            "scanGaps", String.join("；", gaps)));
        } catch (IOException | NoSuchAlgorithmException exception) {
            throw new IllegalStateException("读取项目源码失败，请检查目录权限", exception);
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
