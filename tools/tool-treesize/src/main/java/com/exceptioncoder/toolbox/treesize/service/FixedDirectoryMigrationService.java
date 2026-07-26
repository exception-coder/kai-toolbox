package com.exceptioncoder.toolbox.treesize.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Safely relocates a small whitelist of application-owned directories whose location cannot
 * be configured by the application itself.
 */
@Service
public class FixedDirectoryMigrationService {

    private static final Logger log = LoggerFactory.getLogger(FixedDirectoryMigrationService.class);
    private static final DateTimeFormatter BACKUP_SUFFIX = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");
    private static final Charset NATIVE_CHARSET = nativeCharset();

    private final Map<String, Definition> definitions;

    public FixedDirectoryMigrationService() {
        Path appData = Path.of(System.getenv().getOrDefault(
                "APPDATA",
                Path.of(System.getProperty("user.home"), "AppData", "Roaming").toString()
        ));
        Definition claudeVm = new Definition(
                "claude-vm-bundles",
                "claude-vm-bundle",
                "Claude VM 运行环境包",
                appData.resolve("Claude").resolve("vm_bundles").toAbsolutePath().normalize(),
                "Claude.exe"
        );
        this.definitions = Map.of(claudeVm.migrationId(), claudeVm);
    }

    public List<Status> list() {
        return definitions.values().stream()
                .sorted(Comparator.comparing(Definition::displayName))
                .map(this::status)
                .toList();
    }

    public Status migrate(String migrationId, String targetRaw) {
        Definition definition = definition(migrationId);
        requireWindows();
        Path source = definition.source();
        Path target = parseTarget(targetRaw);
        validate(definition, target);

        Snapshot sourceSnapshot = snapshot(source);
        Path targetParent = target.getParent();
        Path staging = targetParent.resolve("." + target.getFileName() + ".kai-copy-" + UUID.randomUUID());
        Path backup = source.resolveSibling(source.getFileName() + ".kai-backup-"
                + BACKUP_SUFFIX.format(LocalDateTime.now()));
        boolean sourceRenamed = false;
        boolean junctionCreated = false;

        try {
            Files.createDirectories(targetParent);
            copyTree(source, staging);
            Snapshot copiedSnapshot = snapshot(staging);
            verifySnapshot(sourceSnapshot, copiedSnapshot);
            Files.move(staging, target, StandardCopyOption.ATOMIC_MOVE);

            Files.move(source, backup, StandardCopyOption.ATOMIC_MOVE);
            sourceRenamed = true;
            createJunction(source, target);
            junctionCreated = true;
            verifyJunction(source, target);

            return new Status(
                    definition.migrationId(),
                    definition.recipeId(),
                    definition.displayName(),
                    source.toString(),
                    target.toString(),
                    backup.toString(),
                    true,
                    true,
                    true,
                    sourceSnapshot.bytes(),
                    copiedSnapshot.files(),
                    copiedSnapshot.bytes(),
                    "迁移完成；原目录备份仍保留在 C 盘，确认 Claude 正常后再清理备份。"
            );
        } catch (IOException | RuntimeException failure) {
            rollback(source, target, staging, backup, sourceRenamed, junctionCreated, failure);
            throw new IllegalArgumentException("固定目录迁移失败：" + failure.getMessage(), failure);
        }
    }

    private Status status(Definition definition) {
        Path source = definition.source();
        boolean linked = isReparsePoint(source);
        boolean available = Files.isDirectory(source) && !linked;
        return new Status(
                definition.migrationId(),
                definition.recipeId(),
                definition.displayName(),
                source.toString(),
                linked ? realPathQuiet(source) : null,
                null,
                available,
                linked,
                linked,
                available ? snapshotQuiet(source).bytes() : 0L,
                0L,
                0L,
                linked ? "目录已经是 Junction，无需再次迁移。" :
                        available ? "关闭 Claude Desktop 后可迁移到其他固定磁盘。" : "源目录不存在。"
        );
    }

    private void validate(Definition definition, Path target) {
        Path source = definition.source();
        if (!Files.isDirectory(source)) {
            throw new IllegalArgumentException("源目录不存在：" + source);
        }
        if (isReparsePoint(source)) {
            throw new IllegalArgumentException("源目录已经是链接或 Junction：" + source);
        }
        if (target.equals(source) || target.startsWith(source) || source.startsWith(target)) {
            throw new IllegalArgumentException("目标目录不能与源目录重叠");
        }
        if (source.getRoot() == null || target.getRoot() == null
                || source.getRoot().equals(target.getRoot())) {
            throw new IllegalArgumentException("目标目录必须位于其他磁盘");
        }
        try {
            String fileSystem = Files.getFileStore(target.getRoot()).type();
            if (!"NTFS".equalsIgnoreCase(fileSystem)) {
                throw new IllegalArgumentException("目标磁盘必须是本机 NTFS 卷，当前为：" + fileSystem);
            }
        } catch (IOException e) {
            throw new IllegalArgumentException("无法读取目标磁盘信息：" + target.getRoot(), e);
        }
        if (Files.exists(target)) {
            throw new IllegalArgumentException("目标目录必须不存在：" + target);
        }
        if (isProcessRunning(definition.processName())) {
            throw new IllegalArgumentException("检测到 Claude Desktop 正在运行，请完全退出后重试");
        }
    }

    private static Path parseTarget(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("目标目录不能为空");
        }
        Path target = Path.of(raw.trim());
        if (!target.isAbsolute() || target.getParent() == null) {
            throw new IllegalArgumentException("目标目录必须是完整绝对路径");
        }
        return target.normalize();
    }

    private static void copyTree(Path source, Path target) throws IOException {
        Files.walkFileTree(source, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                Files.createDirectories(target.resolve(source.relativize(dir)));
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                if (attrs.isSymbolicLink() || attrs.isOther()) {
                    throw new IOException("源目录包含链接或重解析点，已停止迁移：" + file);
                }
                Files.copy(file, target.resolve(source.relativize(file)),
                        StandardCopyOption.COPY_ATTRIBUTES);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private static Snapshot snapshot(Path root) {
        try {
            SnapshotVisitor visitor = new SnapshotVisitor(root);
            Files.walkFileTree(root, visitor);
            return visitor.snapshot();
        } catch (IOException e) {
            throw new IllegalArgumentException("无法完整读取目录：" + root + "，" + e.getMessage(), e);
        }
    }

    private static Snapshot snapshotQuiet(Path root) {
        try {
            return snapshot(root);
        } catch (RuntimeException ignored) {
            return new Snapshot(0L, 0L, List.of());
        }
    }

    private static void verifySnapshot(Snapshot source, Snapshot target) throws IOException {
        if (source.files() != target.files()
                || source.bytes() != target.bytes()
                || !source.relativeFiles().equals(target.relativeFiles())) {
            throw new IOException("复制校验失败：源与目标的文件数、字节数或相对路径不一致");
        }
    }

    private static void createJunction(Path source, Path target) throws IOException {
        runNative("cmd.exe", "/c", "mklink", "/J", source.toString(), target.toString());
    }

    private static void verifyJunction(Path source, Path target) throws IOException {
        if (!isReparsePoint(source) || !Files.isSameFile(source, target)) {
            throw new IOException("Junction 校验失败，源路径未正确指向目标目录");
        }
    }

    private static void rollback(
            Path source,
            Path target,
            Path staging,
            Path backup,
            boolean sourceRenamed,
            boolean junctionCreated,
            Exception original
    ) {
        try {
            if (junctionCreated && Files.exists(source, LinkOption.NOFOLLOW_LINKS)) {
                Files.delete(source);
            }
            if (sourceRenamed && Files.exists(backup) && !Files.exists(source, LinkOption.NOFOLLOW_LINKS)) {
                Files.move(backup, source, StandardCopyOption.ATOMIC_MOVE);
            }
            deleteTree(staging);
            if (Files.exists(target) && !sourceRenamed) {
                deleteTree(target);
            }
        } catch (IOException rollbackFailure) {
            original.addSuppressed(rollbackFailure);
            log.error("fixed-directory migration rollback failed. source={} target={} backup={}",
                    source, target, backup, rollbackFailure);
        }
    }

    private static void deleteTree(Path root) throws IOException {
        if (!Files.exists(root, LinkOption.NOFOLLOW_LINKS)) {
            return;
        }
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                Files.delete(file);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult postVisitDirectory(Path dir, IOException error) throws IOException {
                if (error != null) {
                    throw error;
                }
                Files.delete(dir);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private static boolean isReparsePoint(Path path) {
        try {
            return Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS).isOther();
        } catch (IOException e) {
            return false;
        }
    }

    private static boolean isProcessRunning(String executableName) {
        String expected = executableName.toLowerCase(Locale.ROOT);
        return ProcessHandle.allProcesses()
                .map(process -> process.info().command().orElse(""))
                .map(command -> {
                    try {
                        return Path.of(command).getFileName().toString().toLowerCase(Locale.ROOT);
                    } catch (RuntimeException ignored) {
                        return "";
                    }
                })
                .anyMatch(expected::equals);
    }

    private static String realPathQuiet(Path source) {
        try {
            return source.toRealPath().toString();
        } catch (IOException e) {
            return "";
        }
    }

    private static void runNative(String... command) throws IOException {
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes(), NATIVE_CHARSET).trim();
        try {
            int exit = process.waitFor();
            if (exit != 0) {
                throw new IOException("系统命令失败 exit=" + exit + (output.isEmpty() ? "" : "：" + output));
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("系统命令被中断", e);
        }
    }

    private static void requireWindows() {
        if (!System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win")) {
            throw new IllegalArgumentException("Junction 迁移仅支持 Windows");
        }
    }

    private static Charset nativeCharset() {
        String encoding = System.getProperty("native.encoding");
        return encoding == null || encoding.isBlank() ? Charset.defaultCharset() : Charset.forName(encoding);
    }

    private Definition definition(String migrationId) {
        Definition definition = definitions.get(migrationId);
        if (definition == null) {
            throw new IllegalArgumentException("不支持的固定目录迁移项：" + migrationId);
        }
        return definition;
    }

    private record Definition(
            String migrationId,
            String recipeId,
            String displayName,
            Path source,
            String processName
    ) {
    }

    public record Status(
            String migrationId,
            String recipeId,
            String displayName,
            String sourcePath,
            String targetPath,
            String backupPath,
            boolean available,
            boolean alreadyLinked,
            boolean junctionVerified,
            long estimatedBytes,
            long copiedFiles,
            long copiedBytes,
            String message
    ) {
    }

    private static final class SnapshotVisitor extends SimpleFileVisitor<Path> {
        private final Path root;
        private final List<String> relativeFiles = new ArrayList<>();
        private long files;
        private long bytes;

        private SnapshotVisitor(Path root) {
            this.root = root;
        }

        @Override
        public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
            if (attrs.isRegularFile()) {
                files++;
                bytes += attrs.size();
                relativeFiles.add(root.relativize(file).toString());
            }
            return FileVisitResult.CONTINUE;
        }

        private Snapshot snapshot() {
            relativeFiles.sort(String.CASE_INSENSITIVE_ORDER);
            return new Snapshot(files, bytes, List.copyOf(relativeFiles));
        }
    }

    private record Snapshot(long files, long bytes, List<String> relativeFiles) {
    }
}
