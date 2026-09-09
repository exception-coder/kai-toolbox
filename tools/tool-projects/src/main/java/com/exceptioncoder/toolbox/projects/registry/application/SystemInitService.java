package com.exceptioncoder.toolbox.projects.registry.application;

import com.exceptioncoder.toolbox.projects.registry.domain.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Full Init 与手动 Sync 编排；每个阶段单独保存，失败保留已发布快照。 */
@Service
public class SystemInitService {
    private static final Logger LOG = LoggerFactory.getLogger(SystemInitService.class);
    private static final String[][] STAGES = {{"repository", "Repository Scan"}, {"environment", "Environment Scan"},
            {"graphify", "Graphify"}, {"semantic", "Semantic Analysis"}, {"mapping", "Route / API / DB Mapping"},
            {"verification", "Verification Discovery"}, {"profile", "System Profile"}};
    private final ProjectRegistryStore store;
    private final ProjectRegistryService projects;
    private final ProjectEvidencePort evidence;

    public SystemInitService(ProjectRegistryStore store, ProjectRegistryService projects, ProjectEvidencePort evidence) {
        this.store = store;
        this.projects = projects;
        this.evidence = evidence;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void recover() {
        store.recoverInterrupted();
    }

    public SystemInitRun start(String projectId, String mode) {
        if (mode == null || !List.of("FULL", "SYNC").contains(mode)) {
            throw new IllegalArgumentException("初始化模式必须是 FULL 或 SYNC");
        }
        RegistryProject project = projects.require(projectId);
        if ("SYNC".equals(mode) && project.profileVersion() == 0) {
            throw new IllegalArgumentException("项目尚未初始化，请先执行 Full Init");
        }
        long now = System.currentTimeMillis();
        List<SystemInitRun.Stage> stages = java.util.Arrays.stream(STAGES)
                .map(stage -> new SystemInitRun.Stage(stage[0], stage[1], "PENDING", "")).toList();
        SystemInitRun run = new SystemInitRun(UUID.randomUUID().toString(), projectId, mode, "RUNNING", stages,
                "", now, now);
        try {
            store.claim(run);
        } catch (IllegalStateException exception) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT, exception.getMessage(), exception);
        }
        Thread.startVirtualThread(() -> execute(project, run));
        return run;
    }

    /** 同步工作体供后台虚拟线程调用，测试可直接覆盖失败与发布路径。 */
    public void execute(RegistryProject project, SystemInitRun initial) {
        RunProgress progress = new RunProgress(initial);
        try {
            progress.begin(0);
            var snapshot = evidence.scan(project.metadata().localPath());
            progress.finish(0, snapshot.complete() ? "COMPLETED" : "PARTIAL", "已发现 " + snapshot.files().size() + " 个工程文件");
            progress.begin(1);
            progress.finish(1, "PARTIAL", "记录工程配置；运行实例与构建未执行");
            String graphGap = collectGraph(project, initial.mode(), progress);
            progress.begin(3);
            var assets = evidence.assets(project.metadata().localPath(), snapshot);
            var semantic = assets.stream().filter(asset -> "SEMANTIC".equals(asset.kind())).findFirst()
                    .orElse(new SystemProfile.Asset("SEMANTIC", "Semantic Registry", "MISSING", List.of(), java.util.Map.of()));
            progress.finish(3, "READY".equals(semantic.status()) ? "COMPLETED" : "PARTIAL",
                    semantic.facts().getOrDefault("evidence", "请在业务域页从代码探索领域"));
            progress.begin(4);
            progress.finish(4, "PARTIAL", "保留 Graphify 与规格入口；API / DDL 运行证据需独立核验");
            progress.begin(5);
            List<String> gaps = collectGaps(assets, snapshot, graphGap);
            progress.finish(5, "COMPLETED", "验证命令已发现；未执行构建或数据库变更");
            progress.begin(6);
            String state = gaps.isEmpty() ? "AI_READY" : "DEGRADED";
            if (!snapshot.fingerprint().equals(evidence.scan(project.metadata().localPath()).fingerprint())) {
                state = "SYNC_REQUIRED";
                gaps.add("初始化期间源码发生变化，请执行同步");
            }
            long now = System.currentTimeMillis();
            SystemProfile profile = new SystemProfile(project.id(), project.profileVersion() + 1, now,
                    snapshot.fingerprint(), state, assets, List.copyOf(gaps));
            progress.finish(6, "COMPLETED", "已生成 System Profile v" + profile.version());
            store.publish(progress.terminal("COMPLETED", "画像已发布"), profile);
        } catch (Exception exception) {
            LOG.error("系统初始化失败 projectId={} runId={}", project.id(), initial.id(), exception);
            progress.failCurrent();
            store.fail(progress.terminal("FAILED", "初始化失败：" + exception.getMessage() + "；请检查目录或工具后重试"));
        }
    }

    private String collectGraph(RegistryProject project, String mode, RunProgress progress) {
        progress.begin(2);
        var graph = evidence.graph(project.metadata().localPath());
        String gap = "";
        if ("SYNC".equals(mode)) {
            gap = evidence.syncGraph(project.metadata().localPath());
            graph = evidence.graph(project.metadata().localPath());
            if (!graph.usable() || !graph.fresh()) {
                throw new IllegalStateException("增量图谱未获得有效覆盖证据，请检查 Graphify 结果");
            }
        } else if (!graph.usable() || !graph.fresh()) {
            gap = evidence.buildGraph(project.metadata().localPath());
            graph = evidence.graph(project.metadata().localPath());
        }
        progress.finish(2, graph.usable() && graph.fresh() ? "COMPLETED" : "PARTIAL",
                gap.isBlank() ? graph.message() : gap);
        return graph.usable() && graph.fresh() ? "" : gap;
    }

    private List<String> collectGaps(List<SystemProfile.Asset> assets, ProjectEvidencePort.RepositorySnapshot snapshot,
                                     String graphGap) {
        List<String> gaps = new ArrayList<>();
        if (!snapshot.complete()) { gaps.add("源码扫描超过边界或存在不可读文件，覆盖不完整"); }
        if (!graphGap.isBlank()) { gaps.add(graphGap); }
        for (SystemProfile.Asset asset : assets) {
            if (!"READY".equals(asset.status())) {
                gaps.add(asset.title() + "：" + asset.facts().getOrDefault("evidence", "证据未齐备，请补齐来源后同步"));
            }
        }
        return gaps;
    }

    private final class RunProgress {
        private final SystemInitRun initial;
        private final List<SystemInitRun.Stage> stages;
        private int current;

        private RunProgress(SystemInitRun initial) {
            this.initial = initial;
            this.stages = new ArrayList<>(initial.stages());
        }

        private void begin(int index) {
            current = index;
            finish(index, "RUNNING", "处理中");
        }

        private void finish(int index, String state, String message) {
            var old = stages.get(index);
            stages.set(index, new SystemInitRun.Stage(old.id(), old.title(), state, message));
            store.saveRun(terminal("RUNNING", ""));
        }

        private void failCurrent() {
            var old = stages.get(current);
            stages.set(current, new SystemInitRun.Stage(old.id(), old.title(), "FAILED", "阶段执行失败"));
        }

        private SystemInitRun terminal(String state, String message) {
            return new SystemInitRun(initial.id(), initial.projectId(), initial.mode(), state, List.copyOf(stages),
                    message, initial.startedAt(), System.currentTimeMillis());
        }
    }
}
