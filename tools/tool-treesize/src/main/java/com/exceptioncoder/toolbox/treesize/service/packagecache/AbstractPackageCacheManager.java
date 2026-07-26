package com.exceptioncoder.toolbox.treesize.service.packagecache;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;

/**
 * 只承载跨管理器一致的文件安全与路径校验，不定义任何配置格式。
 */
abstract class AbstractPackageCacheManager implements PackageCacheManager {

    protected final Path userHome = Path.of(System.getProperty("user.home")).toAbsolutePath().normalize();

    @Override
    public final Status status() {
        Path defaultPath = defaultPath();
        Path configPath = configPath();
        String environmentPath = environmentOverride();
        String configuredPath = environmentPath == null ? readConfiguredPath(configPath) : environmentPath;
        Path currentPath = configuredPath == null || configuredPath.isBlank()
                ? defaultPath
                : expandUserPath(configuredPath);
        boolean supported = environmentPath == null;
        return status(
                currentPath,
                defaultPath,
                configPath,
                supported,
                null,
                null,
                supported
                        ? "按 " + configurationMethod() + " 切换；旧缓存不会自动搬运或删除。"
                        : "当前路径由环境变量覆盖，请先移除 " + environmentVariableName() + "。");
    }

    @Override
    public final Status configure(String targetPath) {
        Status before = status();
        if (!before.migrationSupported()) {
            throw new IllegalArgumentException(before.message());
        }
        Path destination = validateDestination(targetPath);
        Path configPath = configPath();
        try {
            Files.createDirectories(destination);
            String content = Files.isRegularFile(configPath)
                    ? Files.readString(configPath, StandardCharsets.UTF_8)
                    : "";
            Path backupPath = writeAtomically(configPath, updateConfig(content, destination));
            Status after = status();
            return status(
                    Path.of(after.currentPath()),
                    Path.of(after.defaultPath()),
                    configPath,
                    after.migrationSupported(),
                    before.currentPath(),
                    backupPath == null ? null : backupPath.toString(),
                    "配置已切换并按原生规则重新读取验证；旧缓存仍保留。");
        } catch (IOException e) {
            throw new IllegalStateException("更新 " + displayName() + " 缓存配置失败", e);
        }
    }

    protected abstract String displayName();

    protected abstract Path defaultPath();

    protected abstract Path configPath();

    protected abstract String environmentOverride();

    protected abstract String environmentVariableName();

    protected abstract String readConfiguredPath(Path configPath);

    protected abstract String updateConfig(String content, Path destination);

    protected abstract String configurationMethod();

    protected abstract String configurationKey();

    protected abstract String verificationCommand();

    protected abstract String cleanupHint();

    protected final Path localAppData() {
        return environmentPath("LOCALAPPDATA", userHome.resolve("AppData").resolve("Local"));
    }

    protected final Path appData() {
        return environmentPath("APPDATA", userHome.resolve("AppData").resolve("Roaming"));
    }

    protected final String readUtf8(Path path) {
        if (!Files.isRegularFile(path)) {
            return "";
        }
        try {
            return Files.readString(path, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("读取 " + displayName() + " 配置失败", e);
        }
    }

    protected final Path expandUserPath(String value) {
        String expanded = stripQuotes(value.trim()).replace("${user.home}", userHome.toString());
        if (expanded.startsWith("~/") || expanded.startsWith("~\\")) {
            expanded = userHome.resolve(expanded.substring(2)).toString();
        }
        return Path.of(expanded).toAbsolutePath().normalize();
    }

    protected static String ensureTrailingNewline(String content) {
        return content.endsWith("\n") || content.endsWith("\r")
                ? content
                : content + System.lineSeparator();
    }

    protected static String stripQuotes(String value) {
        if (value.length() >= 2
                && ((value.startsWith("\"") && value.endsWith("\""))
                || (value.startsWith("'") && value.endsWith("'")))) {
            return value.substring(1, value.length() - 1);
        }
        return value;
    }

    private Status status(
            Path currentPath,
            Path defaultPath,
            Path configPath,
            boolean supported,
            String previousPath,
            String backupPath,
            String message
    ) {
        return new Status(
                id(),
                displayName(),
                currentPath.toString(),
                defaultPath.toString(),
                configPath.toString(),
                supported,
                previousPath,
                backupPath,
                configurationMethod(),
                configurationKey(),
                verificationCommand(),
                cleanupHint(),
                message);
    }

    private Path validateDestination(String targetPath) {
        if (targetPath == null || targetPath.isBlank()) {
            throw new IllegalArgumentException("目标缓存目录不能为空");
        }
        Path raw;
        try {
            raw = Path.of(targetPath);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("目标缓存目录格式无效", e);
        }
        if (!raw.isAbsolute()) {
            throw new IllegalArgumentException("目标缓存目录必须是绝对路径");
        }
        Path destination = raw.toAbsolutePath().normalize();
        Path source = defaultPath();
        if (destination.startsWith(source) || source.startsWith(destination)) {
            throw new IllegalArgumentException("目标目录不能与默认缓存目录互相包含");
        }
        for (Path protectedRoot : protectedRoots()) {
            if (destination.startsWith(protectedRoot)) {
                throw new IllegalArgumentException("目标目录不能位于系统保护目录：" + protectedRoot);
            }
        }
        return destination;
    }

    private Path writeAtomically(Path configPath, String content) throws IOException {
        Files.createDirectories(configPath.getParent());
        Path backupPath = null;
        if (Files.exists(configPath)) {
            backupPath = configPath.resolveSibling(configPath.getFileName() + ".kai-toolbox.bak");
            Files.copy(configPath, backupPath, StandardCopyOption.REPLACE_EXISTING);
        }
        Path temporary = Files.createTempFile(configPath.getParent(), configPath.getFileName().toString(), ".tmp");
        Files.writeString(temporary, content, StandardCharsets.UTF_8);
        try {
            Files.move(temporary, configPath, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(temporary, configPath, StandardCopyOption.REPLACE_EXISTING);
        }
        return backupPath;
    }

    private List<Path> protectedRoots() {
        return List.of(
                environmentPath("SystemRoot", Path.of("C:\\Windows")),
                environmentPath("ProgramFiles", Path.of("C:\\Program Files")));
    }

    private Path environmentPath(String name, Path fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : Path.of(value).toAbsolutePath().normalize();
    }
}
