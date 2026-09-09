package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.file.*;
import java.time.Duration;
import java.util.List;

/** 隔离 Graphify 输出，在输入与旧图谱均未变化时发布结构图更新。 */
@Component
public class GraphifyIncrementalUpdater {
    private static final Logger LOG = LoggerFactory.getLogger(GraphifyIncrementalUpdater.class);
    private final RegistrySourceScanner scanner;
    private final RegistryCommandRunner commands;
    private final ObjectMapper json;
    private final String python;

    public GraphifyIncrementalUpdater(RegistrySourceScanner scanner, RegistryCommandRunner commands,
                                     ObjectMapper json,
                                     @Value("${toolbox.projects.graphify-python:python}") String python) {
        this.scanner = scanner;
        this.commands = commands;
        this.json = json;
        this.python = python;
    }

    /** @param root 规范化项目根 @param incremental 是否必须使用已有基线 @return 实际更新范围。 */
    public String update(Path root, boolean incremental) {
        Path output = root.resolve("graphify-out");
        try {
            if (Files.isSymbolicLink(output)) {
                throw new IllegalStateException("图谱目录不能是符号链接");
            }
            Files.createDirectories(output);
            try (var channel = FileChannel.open(output.resolve(".forge-sync.lock"),
                    StandardOpenOption.CREATE, StandardOpenOption.WRITE);
                 var lock = channel.tryLock()) {
                if (lock == null) {
                    throw new IllegalStateException("另一个 Forge 图谱更新正在运行，请稍后重试");
                }
                return stageAndPublish(root, output, incremental);
            }
        } catch (IOException exception) {
            throw new IllegalStateException("图谱更新文件操作失败，未确认新画像", exception);
        }
    }

    private String stageAndPublish(Path root, Path output, boolean incremental) throws IOException {
        var before = scanner.scan(root);
        if (!before.complete()) {
            throw new IllegalStateException("源码扫描不完整，未启动图谱更新");
        }
        var operatingSystem = java.lang.management.ManagementFactory.getOperatingSystemMXBean();
        if (operatingSystem instanceof com.sun.management.OperatingSystemMXBean memory
                && memory.getFreeMemorySize() < 2L * 1024 * 1024 * 1024) {
            throw new IllegalStateException("可用物理内存不足 2 GiB，原图谱保留，请释放资源后重试");
        }
        var publication = new GraphifyPublication(output);
        Path stage = Files.createTempDirectory("forge-graphify-");
        try {
            Path script = stage.resolve("registry_sync.py");
            try (var input = new ClassPathResource("graphify/registry_sync.py").getInputStream()) {
                Files.copy(input, script);
            }
            var result = commands.run(root, List.of(python, "-I", script.toString(), "--root", root.toString(),
                    "--stage", stage.toString(), "--mode", incremental ? "SYNC" : "FULL"), Duration.ofMinutes(10));
            if (result.exitCode() != 0) {
                throw new IllegalStateException("Graphify 更新失败，原图谱保留。请检查本机 Python/graphifyy 环境：" + result.output());
            }
            var after = scanner.scan(root);
            if (!after.complete() || !before.fingerprint().equals(after.fingerprint())) {
                throw new IllegalStateException("图谱更新期间源码变化，候选结果未发布，请重试");
            }
            var report = json.readTree(stage.resolve("forge-sync-result.json").toFile());
            boolean noChanges = report.path("noChanges").asBoolean(false);
            publication.publish(stage, before.fingerprint(), noChanges);
            try {
                publication.copyCache(stage);
            } catch (IOException exception) {
                LOG.warn("图谱已发布，但 AST 缓存未完整保存，下次可重新提取：{}", exception.getMessage());
            }
            return (noChanges ? "结构图无变更；" : incremental ? "结构图增量更新完成；" : "结构图完整构建完成；")
                    + "新增/修改 " + report.path("changed").asInt() + "，删除/移出 " + report.path("deleted").asInt()
                    + "，关联重提取 " + report.path("affected").asInt() + "，复用 " + report.path("reused").asInt()
                    + " 个文件。语义与社区未重新分析。";
        } finally {
            try {
                GraphifyPublication.removeStage(stage);
            } catch (IOException exception) {
                LOG.warn("清理 Graphify 临时目录失败：{}", stage);
            }
        }
    }
}
