package com.exceptioncoder.toolbox.claudechat.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** SDK 隔离副本与同盘备份；只提升依赖及构建产物，不覆盖源码。 */
final class SidecarSdkUpgradeWorkspace {
    private static final List<String> INPUTS = List.of("package.json", "package-lock.json", "tsconfig.json", "src", "scripts");
    private static final List<String> OUTPUTS = List.of("package.json", "package-lock.json", "node_modules", "dist");
    private final Path source;
    private final Path stage;
    private final Path backup;
    private final Map<String, String> fingerprints;
    private final List<String> saved = new ArrayList<>();
    private final List<String> promoted = new ArrayList<>();

    SidecarSdkUpgradeWorkspace(Path source) throws IOException {
        this.source = source.toRealPath();
        Path jobs = this.source.resolve(".sdk-upgrades");
        Files.createDirectories(jobs);
        if (Files.isSymbolicLink(jobs)) {
            throw new IOException("升级目录不允许符号链接");
        }
        Path job = Files.createTempDirectory(jobs, "upgrade-");
        this.stage = Files.createDirectory(job.resolve("stage"));
        this.backup = Files.createDirectory(job.resolve("backup"));
        this.fingerprints = fingerprint(this.source);
        for (String name : fingerprints.keySet()) {
            Path target = stage.resolve(name);
            Files.createDirectories(target.getParent());
            Files.copy(this.source.resolve(name), target);
        }
        assertUnchanged();
    }

    Path stage() { return stage; }
    Path backup() { return backup; }
    Path logFile() { return stage.getParent().resolve("upgrade.log"); }

    void assertUnchanged() throws IOException {
        if (!fingerprints.equals(fingerprint(source))) {
            throw new IOException("准备期间源码或依赖文件发生变化，已保留当前文件，请重新升级");
        }
    }

    /** 逐项提升并记录恢复顺序；调用方负责在运行时失败时调用 rollback。 */
    void promote() throws IOException {
        assertUnchanged();
        for (String name : OUTPUTS) {
            if (!Files.exists(stage.resolve(name), LinkOption.NOFOLLOW_LINKS)) {
                throw new IOException("升级产物缺失：" + name);
            }
            if (Files.isSymbolicLink(source.resolve(name))) {
                throw new IOException("运行目录不允许符号链接：" + name);
            }
        }
        for (String name : OUTPUTS) {
            if (Files.exists(source.resolve(name))) {
                Files.move(source.resolve(name), backup.resolve(name));
                saved.add(name);
            }
            Files.move(stage.resolve(name), source.resolve(name));
            promoted.add(name);
        }
    }

    /** 将失败的新文件移回隔离区，再恢复原文件；不删除诊断数据。 */
    void rollback() throws IOException {
        for (String name : promoted.reversed()) {
            Files.move(source.resolve(name), stage.resolve(name));
        }
        promoted.clear();
        for (String name : saved.reversed()) {
            Files.move(backup.resolve(name), source.resolve(name));
        }
        saved.clear();
    }

    private static Map<String, String> fingerprint(Path root) throws IOException {
        Map<String, String> result = new LinkedHashMap<>();
        for (String input : INPUTS) {
            Path path = root.resolve(input);
            try (var paths = Files.walk(path)) {
                for (Path file : paths.sorted().toList()) {
                    if (Files.isSymbolicLink(file)) {
                        throw new IOException("升级输入不允许符号链接：" + root.relativize(file));
                    }
                    if (Files.isRegularFile(file)) {
                        result.put(root.relativize(file).toString(), digest(file));
                    }
                }
            }
        }
        return result;
    }

    private static String digest(Path file) throws IOException {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(file)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }
}
