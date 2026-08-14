package com.exceptioncoder.toolbox.system.update;

import com.exceptioncoder.toolbox.ToolboxApplication;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.system.ApplicationHome;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/** 在 detached worktree 中构建候选发布物，旧 JVM 运行目录和 target/classes 不会被覆盖。 */
@Component
public class AutoUpdateCandidateBuilder {

    private static final Logger log = LoggerFactory.getLogger(AutoUpdateCandidateBuilder.class);
    private static final String READY_FILE = ".kai-auto-update-ready";
    private static final String OWNER_PREFIX = ".kai-auto-update-owner-";
    private static final String OWNER_SUFFIX = ".marker";
    private static final Pattern SHA = Pattern.compile("[0-9a-fA-F]{40,64}");

    private final AutoUpdateProperties properties;
    private final AutoUpdateRepository repository;
    private final AutoUpdateCommandRunner runner;
    private final Path releaseRoot;

    public AutoUpdateCandidateBuilder(AutoUpdateProperties properties,
                                      AutoUpdateRepository repository,
                                      AutoUpdateCommandRunner runner,
                                      @Value("${toolbox.data-dir:${user.home}/.kai-toolbox}") String dataDir) {
        this.properties = properties;
        this.repository = repository;
        this.runner = runner;
        this.releaseRoot = Path.of(dataDir).toAbsolutePath().normalize()
                .resolve("auto-update").resolve("releases");
    }

    public BuildResult prepare(Path root, String candidateSha) {
        try {
            Files.createDirectories(releaseRoot);
        } catch (IOException e) {
            return BuildResult.failed("无法创建候选发布目录：" + e.getMessage());
        }
        cleanupOldReleases(root, candidateSha);
        Path reusable = releaseRoot.resolve(candidateSha);
        Path reusableJar = jarAt(reusable);
        if (ready(reusable, candidateSha) && validJar(reusableJar)) {
            return BuildResult.ready(reusable, reusableJar, true);
        }
        if (Files.exists(reusable)) {
            CleanupResult recovery = cleanupManagedWorktree(root, reusable, candidateSha);
            if (!recovery.success()) {
                return BuildResult.failed("候选目录未就绪且安全清理失败，拒绝继续累积 worktree："
                        + reusable + "；" + recovery.error());
            }
        }

        Path stage = reusable;
        if (!markOwned(candidateSha)) {
            return BuildResult.failed("无法登记受管候选 worktree，拒绝开始构建：" + stage);
        }
        AutoUpdateCommandRunner.Result add = repository.addDetachedWorktree(root, stage, candidateSha);
        if (!add.success()) {
            // add 可能在失败前已登记/创建一部分 worktree；有目录时保留 owner，供下轮安全恢复。
            if (!Files.exists(stage)) deleteOwnership(candidateSha);
            return BuildResult.failed("创建候选 worktree 失败：" + add.summary());
        }

        AutoUpdateCommandRunner.Result sidecar = installAndBuildSidecar(stage);
        if (!sidecar.success()) return failedAndCleanup(root, stage, "构建 Claude sidecar 失败：" + sidecar.summary());

        AutoUpdateCommandRunner.Result browser = installNodeService(stage.resolve("node-services/undetected-browser"));
        if (!browser.success()) return failedAndCleanup(root, stage,
                "安装浏览器 sidecar 依赖失败：" + browser.summary());

        AutoUpdateCommandRunner.Result maven = runner.runTool(stage, properties.getBuildTimeout(),
                properties.getMavenCommand(),
                List.of("-pl", "toolbox-starter", "-am", "-DskipTests", "package"));
        if (!maven.success()) return failedAndCleanup(root, stage, "构建候选应用失败：" + maven.summary());

        Path jar = jarAt(stage);
        if (!validJar(jar)) return failedAndCleanup(root, stage, "候选 fat jar 未生成或文件异常：" + jar);
        try {
            Files.writeString(stage.resolve(READY_FILE), candidateSha + "\n" + Instant.now() + "\n",
                    StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
        } catch (IOException e) {
            return failedAndCleanup(root, stage, "候选构建完成但无法写入就绪标记：" + e.getMessage());
        }
        log.info("[auto-update] 候选构建完成 sha={} stage={}", candidateSha, stage);
        return BuildResult.ready(stage, jar, false);
    }

    private BuildResult failedAndCleanup(Path root, Path stage, String error) {
        Path normalized = stage.toAbsolutePath().normalize();
        if (!normalized.startsWith(releaseRoot)) {
            return BuildResult.failed(error + "；拒绝清理越界候选目录 " + normalized, stage);
        }
        CleanupResult cleanup = cleanupManagedWorktree(root, normalized, normalized.getFileName().toString());
        if (!cleanup.success()) {
            log.warn("[auto-update] 候选构建失败且 worktree 清理失败 stage={} error={}", normalized, cleanup.error());
            return BuildResult.failed(error + "；候选目录清理失败：" + cleanup.error(), stage);
        }
        return BuildResult.failed(error);
    }

    /** 保留当前运行版本和最近两个就绪候选；失败/崩溃遗留由外部 owner marker 在后续轮次继续回收。 */
    private void cleanupOldReleases(Path root, String candidateSha) {
        Path runningSource = null;
        try {
            var source = new ApplicationHome(ToolboxApplication.class).getSource();
            if (source != null) runningSource = source.toPath().toAbsolutePath().normalize();
        } catch (RuntimeException ignore) {
            // 无法确认当前 jar 时只按最近版本保守保留。
        }
        try (var entries = Files.list(releaseRoot)) {
            List<Path> snapshot = entries.toList();
            Set<Path> managedSet = new LinkedHashSet<>();
            snapshot.stream()
                    .filter(Files::isDirectory)
                    .filter(path -> Files.isRegularFile(path.resolve(READY_FILE)))
                    .map(path -> path.toAbsolutePath().normalize())
                    .forEach(managedSet::add);
            for (Path marker : snapshot) {
                String sha = ownedSha(marker);
                if (sha == null) continue;
                Path stage = releaseRoot.resolve(sha).toAbsolutePath().normalize();
                if (Files.isDirectory(stage)) managedSet.add(stage);
                else deleteOwnership(sha);
            }
            List<Path> managed = managedSet.stream()
                    .sorted(Comparator.comparingLong(AutoUpdateCandidateBuilder::lastModified).reversed())
                    .toList();
            int retained = 0;
            for (Path path : managed) {
                Path normalized = path.toAbsolutePath().normalize();
                boolean candidate = path.getFileName().toString().equals(candidateSha);
                boolean running = runningSource != null && runningSource.startsWith(normalized);
                boolean ready = Files.isRegularFile(path.resolve(READY_FILE));
                if (candidate || running || (ready && retained++ < 2)) continue;
                CleanupResult cleanup = cleanupManagedWorktree(root, normalized, path.getFileName().toString());
                if (!cleanup.success()) {
                    log.warn("[auto-update] 旧候选 worktree 清理失败 stage={} error={}", normalized, cleanup.error());
                }
            }
        } catch (IOException e) {
            log.debug("[auto-update] 扫描旧候选目录失败：{}", e.getMessage());
        }
    }

    private static long lastModified(Path path) {
        try {
            Path ready = path.resolve(READY_FILE);
            return Files.getLastModifiedTime(Files.exists(ready) ? ready : path).toMillis();
        } catch (IOException e) {
            return 0;
        }
    }

    private boolean markOwned(String sha) {
        if (!SHA.matcher(sha).matches()) return false;
        Path marker = ownershipFile(sha);
        try {
            Files.writeString(marker, sha + "\n" + Instant.now() + "\n", StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
            return true;
        } catch (IOException e) {
            log.warn("[auto-update] 无法写入候选 owner marker sha={} error={}", sha, e.getMessage());
            return false;
        }
    }

    private String ownedSha(Path marker) {
        if (!Files.isRegularFile(marker)) return null;
        String name = marker.getFileName().toString();
        if (!name.startsWith(OWNER_PREFIX) || !name.endsWith(OWNER_SUFFIX)) return null;
        String sha = name.substring(OWNER_PREFIX.length(), name.length() - OWNER_SUFFIX.length());
        if (!SHA.matcher(sha).matches()) return null;
        try {
            String declared = Files.readString(marker, StandardCharsets.UTF_8).lines()
                    .findFirst().orElse("");
            return declared.equalsIgnoreCase(sha) ? sha : null;
        } catch (IOException e) {
            return null;
        }
    }

    private Path ownershipFile(String sha) {
        return releaseRoot.resolve(OWNER_PREFIX + sha + OWNER_SUFFIX);
    }

    private void deleteOwnership(String sha) {
        if (sha == null || !SHA.matcher(sha).matches()) return;
        try {
            Files.deleteIfExists(ownershipFile(sha));
        } catch (IOException e) {
            log.debug("[auto-update] 清理 owner marker 失败 sha={} error={}", sha, e.getMessage());
        }
    }

    private CleanupResult cleanupManagedWorktree(Path root, Path stage, String sha) {
        Path normalized = stage.toAbsolutePath().normalize();
        if (!managedStage(normalized, sha)) {
            return CleanupResult.failed("候选目录越过受管 releases/SHA 边界");
        }
        AutoUpdateCommandRunner.Result removal = repository.removeWorktree(root, normalized);
        if (removal.success() && !Files.exists(normalized)) {
            deleteOwnership(sha);
            repository.pruneWorktrees(root);
            return CleanupResult.ok();
        }

        // git worktree add 被中断时，目录可能已创建但尚未来得及写入 Git worktree 元数据。
        // prune 后只有 Git 明确确认“未登记”，且存在本组件 owner/ready 证据时，才允许文件系统兜底删除。
        repository.pruneWorktrees(root);
        AutoUpdateRepository.WorktreeRegistration registration = repository.worktreeRegistration(root, normalized);
        if (registration.error() != null) {
            return CleanupResult.failed(removal.summary() + "；无法确认 worktree 登记状态：" + registration.error());
        }
        if (registration.registered()) {
            return CleanupResult.failed(removal.summary() + "；Git 仍登记该 worktree");
        }
        if (!managedEvidence(normalized, sha)) {
            return CleanupResult.failed(removal.summary() + "；缺少可信 owner/ready 标记，拒绝递归删除");
        }
        try {
            deleteManagedTree(normalized);
            deleteOwnership(sha);
            repository.pruneWorktrees(root);
            return CleanupResult.ok();
        } catch (IOException e) {
            return CleanupResult.failed(removal.summary() + "；半成品目录删除失败：" + e.getMessage());
        }
    }

    private boolean managedStage(Path stage, String sha) {
        return sha != null && SHA.matcher(sha).matches()
                && stage.getParent() != null
                && stage.getParent().equals(releaseRoot)
                && stage.getFileName().toString().equalsIgnoreCase(sha)
                && !Files.isSymbolicLink(stage);
    }

    private boolean managedEvidence(Path stage, String sha) {
        if (ownedSha(ownershipFile(sha)) != null) return true;
        Path ready = stage.resolve(READY_FILE);
        try {
            return Files.isRegularFile(ready)
                    && Files.readString(ready, StandardCharsets.UTF_8).lines()
                    .findFirst().orElse("").equalsIgnoreCase(sha);
        } catch (IOException e) {
            return false;
        }
    }

    private static void deleteManagedTree(Path stage) throws IOException {
        if (!Files.exists(stage)) return;
        try (var paths = Files.walk(stage)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }

    private AutoUpdateCommandRunner.Result installAndBuildSidecar(Path stage) {
        Path sidecar = stage.resolve("sidecar/claude-agent");
        if (!Files.isRegularFile(sidecar.resolve("package.json"))) {
            return AutoUpdateCommandRunner.Result.failed("缺少 sidecar/claude-agent/package.json");
        }
        AutoUpdateCommandRunner.Result install = npmInstall(sidecar);
        if (!install.success()) return install;
        return runner.runTool(sidecar, properties.getBuildTimeout(), properties.getNpmCommand(), List.of("run", "build"));
    }

    private AutoUpdateCommandRunner.Result installNodeService(Path directory) {
        if (!Files.isRegularFile(directory.resolve("package.json"))) {
            return new AutoUpdateCommandRunner.Result(0, "", "", false, null);
        }
        return npmInstall(directory);
    }

    private AutoUpdateCommandRunner.Result npmInstall(Path directory) {
        List<String> args = Files.isRegularFile(directory.resolve("package-lock.json"))
                ? List.of("ci", "--no-audit", "--no-fund")
                : List.of("install", "--no-audit", "--no-fund");
        return runner.runTool(directory, properties.getBuildTimeout(), properties.getNpmCommand(), args);
    }

    private static boolean ready(Path stage, String sha) {
        Path marker = stage.resolve(READY_FILE);
        try {
            return Files.isRegularFile(marker)
                    && Files.readString(marker, StandardCharsets.UTF_8).lines().findFirst().orElse("").equals(sha);
        } catch (IOException e) {
            return false;
        }
    }

    private static Path jarAt(Path stage) {
        return stage.resolve("toolbox-starter/target/kai-toolbox.jar");
    }

    private static boolean validJar(Path jar) {
        try {
            return Files.isRegularFile(jar) && Files.size(jar) > 1_048_576;
        } catch (IOException e) {
            return false;
        }
    }

    public record BuildResult(boolean success, Path stage, Path jar, boolean reused, String error) {
        static BuildResult ready(Path stage, Path jar, boolean reused) {
            return new BuildResult(true, stage, jar, reused, null);
        }
        static BuildResult failed(String error) { return new BuildResult(false, null, null, false, error); }
        static BuildResult failed(String error, Path stage) { return new BuildResult(false, stage, null, false, error); }
    }

    private record CleanupResult(boolean success, String error) {
        static CleanupResult ok() { return new CleanupResult(true, null); }
        static CleanupResult failed(String error) { return new CleanupResult(false, error); }
    }
}
