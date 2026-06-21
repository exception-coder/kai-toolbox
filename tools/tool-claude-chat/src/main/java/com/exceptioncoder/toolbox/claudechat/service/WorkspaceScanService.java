package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ProjectModulesResponse;
import com.exceptioncoder.toolbox.claudechat.api.dto.ProjectModulesResponse.ModuleView;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceDirView;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse.RootView;
import com.exceptioncoder.toolbox.claudechat.config.WorkspaceProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

/**
 * 扫描配置根目录的一级子目录，供新建会话选 cwd。对标项目管理面板的「一级扫描 + 短 TTL 缓存」。
 *
 * <p>缓存为整次扫描结果的单一快照：TTL 内任何请求直接返回，过期重扫。无锁——并发下最坏多扫一两次，
 * 结果一致，可接受。</p>
 */
@Slf4j
@Service
public class WorkspaceScanService {

    private final WorkspaceProperties props;

    private volatile WorkspaceListResponse cache;
    private volatile long cacheExpireAt;

    public WorkspaceScanService(WorkspaceProperties props) {
        this.props = props;
    }

    public WorkspaceListResponse scan() {
        long now = System.currentTimeMillis();
        WorkspaceListResponse cached = cache;
        if (cached != null && now < cacheExpireAt) {
            return cached;
        }

        List<RootView> roots = new ArrayList<>();
        for (String rootSetting : props.getRoots()) {
            roots.add(scanRoot(rootSetting));
        }
        WorkspaceListResponse result = new WorkspaceListResponse(List.copyOf(roots), OffsetDateTime.now());

        cache = result;
        int ttl = props.getCacheTtlSeconds() <= 0 ? 5 : props.getCacheTtlSeconds();
        cacheExpireAt = now + ttl * 1000L;
        return result;
    }

    private RootView scanRoot(String rootSetting) {
        if (rootSetting == null || rootSetting.isBlank()) {
            return new RootView("", false, List.of());
        }
        Path root = Path.of(rootSetting).toAbsolutePath().normalize();
        if (!Files.isDirectory(root)) {
            log.debug("workspace 根目录不存在或不可读: {}", root);
            return new RootView(rootSetting, false, List.of());
        }

        List<WorkspaceDirView> dirs = new ArrayList<>();
        try (Stream<Path> children = Files.list(root)) {
            children.filter(this::isCandidate)
                    .sorted(Comparator.comparing(p -> p.getFileName().toString(), String.CASE_INSENSITIVE_ORDER))
                    .forEach(p -> dirs.add(new WorkspaceDirView(p.getFileName().toString(), p.toString())));
        } catch (IOException e) {
            log.debug("扫描 workspace 根目录失败: {}", root, e);
            return new RootView(rootSetting, true, List.of());
        }
        return new RootView(rootSetting, true, List.copyOf(dirs));
    }

    // ===== 项目模块扫描（确定性：按构建标志文件识别），供「项目工作台」=====

    /** 递归扫描最大深度（项目根=0）。tools/tool-xxx 这类两级布局需到 2，留一点冗余取 3。 */
    private static final int MODULE_MAX_DEPTH = 3;
    /** 递归剪枝：这些目录体量大/非源码，绝不进入，避免扫爆。 */
    private static final Set<String> MODULE_IGNORE = Set.of(
            "node_modules", "target", "dist", "build", ".git", ".idea", ".gradle",
            "out", "bin", "obj", "venv", ".venv", "__pycache__", ".next", ".turbo", "coverage", "vendor");

    /** 扫描某项目下的模块。path 必须在配置根之内（防路径穿越/任意盘符扫描）。 */
    public ProjectModulesResponse scanModules(String projectPath) {
        if (projectPath == null || projectPath.isBlank()) {
            return new ProjectModulesResponse("", "", false, List.of());
        }
        Path root = Path.of(projectPath).toAbsolutePath().normalize();
        String name = root.getFileName() == null ? root.toString() : root.getFileName().toString();
        if (!isUnderConfiguredRoot(root) || !Files.isDirectory(root)) {
            log.debug("scanModules 拒绝/不存在: {}", root);
            return new ProjectModulesResponse(name, root.toString(), false, List.of());
        }
        List<ModuleView> modules = new ArrayList<>();
        collectModules(root, root, 0, modules);
        modules.sort(Comparator.comparing(ModuleView::relPath, String.CASE_INSENSITIVE_ORDER));
        return new ProjectModulesResponse(name, root.toString(), true, List.copyOf(modules));
    }

    private void collectModules(Path projectRoot, Path dir, int depth, List<ModuleView> out) {
        String type = detectModuleType(dir);
        if (type != null) {
            Path rel = projectRoot.relativize(dir);
            String relStr = rel.toString().isEmpty() ? "." : rel.toString().replace('\\', '/');
            out.add(new ModuleView(dir.getFileName().toString(), relStr, dir.toString(), type));
        }
        if (depth >= MODULE_MAX_DEPTH) return;
        try (Stream<Path> children = Files.list(dir)) {
            children.filter(Files::isDirectory)
                    .filter(p -> {
                        String n = p.getFileName().toString();
                        return !n.startsWith(".") && !MODULE_IGNORE.contains(n);
                    })
                    .sorted(Comparator.comparing(p -> p.getFileName().toString(), String.CASE_INSENSITIVE_ORDER))
                    .forEach(p -> collectModules(projectRoot, p, depth + 1, out));
        } catch (IOException e) {
            log.debug("扫描模块子目录失败: {}", dir);
        }
    }

    /** 按标志文件判模块类型；都没有返回 null（不是模块）。 */
    private String detectModuleType(Path dir) {
        if (Files.exists(dir.resolve("pom.xml"))) return "maven";
        if (Files.exists(dir.resolve("build.gradle")) || Files.exists(dir.resolve("build.gradle.kts"))) return "gradle";
        if (Files.exists(dir.resolve("package.json"))) return "node";
        if (Files.exists(dir.resolve("go.mod"))) return "go";
        if (Files.exists(dir.resolve("Cargo.toml"))) return "rust";
        if (Files.exists(dir.resolve("pyproject.toml")) || Files.exists(dir.resolve("requirements.txt"))
                || Files.exists(dir.resolve("setup.py"))) return "python";
        return null;
    }

    /** 限制扫描范围：仅允许配置根本身或其子路径，避免被传入任意路径扫整盘。 */
    private boolean isUnderConfiguredRoot(Path path) {
        for (String r : props.getRoots()) {
            if (r == null || r.isBlank()) continue;
            Path root = Path.of(r).toAbsolutePath().normalize();
            if (path.equals(root) || path.startsWith(root)) return true;
        }
        return false;
    }

    private boolean isCandidate(Path dir) {
        if (!Files.isDirectory(dir)) {
            return false;
        }
        String name = dir.getFileName().toString();
        for (String prefix : props.getHiddenPrefixes()) {
            if (name.startsWith(prefix)) {
                return false;
            }
        }
        return true;
    }
}
