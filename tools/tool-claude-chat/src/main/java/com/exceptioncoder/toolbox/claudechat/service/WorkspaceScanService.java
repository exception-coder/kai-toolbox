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
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    private volatile WorkspaceListResponse cache;
    private volatile long cacheExpireAt;

    public WorkspaceScanService(WorkspaceProperties props, com.fasterxml.jackson.databind.ObjectMapper objectMapper) {
        this.props = props;
        this.objectMapper = objectMapper;
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
        // 优先读知识库 modules.json（业务模块树 + 代码路径）；未配置或找不到才回退按构建文件自动识别。
        List<ModuleView> fromKnowledge = readKnowledgeModules(root, name);
        if (fromKnowledge != null) {
            return new ProjectModulesResponse(name, root.toString(), true, fromKnowledge);
        }
        collectModules(root, root, 0, modules);
        modules.sort(Comparator.comparing(ModuleView::relPath, String.CASE_INSENSITIVE_ORDER));
        return new ProjectModulesResponse(name, root.toString(), true, List.copyOf(modules));
    }

    /** 知识库 modules.json 文件名（位于 {knowledgeBaseDir}/{project}/impl/ 下）。 */
    private static final String KB_MODULES_FILE = "modules.json";

    /**
     * 读知识库为该项目声明的模块树：{@code {knowledgeBaseDir}/{projectName}/impl/modules.json}。
     * projectName 即工作区项目目录名，须与知识库 project key 一致（方案：按目录名匹配）。
     *
     * <p>返回 null 表示「未启用 / 无此文件」，调用方回退自动识别；返回（可能空的）列表表示
     * 「知识库已声明该项目」，即便为空也不再自动识别。codePath 越界（借 ../ 逃出项目根）的条目被跳过。</p>
     */
    private List<ModuleView> readKnowledgeModules(Path root, String projectName) {
        String kbDir = props.getKnowledgeBaseDir();
        if (kbDir == null || kbDir.isBlank()) return null;
        Path manifest = Path.of(kbDir).resolve(projectName).resolve("impl").resolve(KB_MODULES_FILE);
        if (!Files.isRegularFile(manifest)) return null;
        try {
            KnowledgeModules parsed = objectMapper.readValue(manifest.toFile(), KnowledgeModules.class);
            if (parsed == null || parsed.modules() == null) return List.of();
            List<ModuleView> out = new ArrayList<>();
            for (KbModule m : parsed.modules()) {
                ModuleView v = toModuleView(root, m);
                if (v != null) out.add(v);
            }
            return List.copyOf(out);
        } catch (IOException e) {
            log.debug("解析知识库 {} 失败，按空模块处理: {}", KB_MODULES_FILE, manifest, e);
            return List.of();
        }
    }

    /**
     * 把一条知识库模块声明转 ModuleView（递归子模块）。
     *
     * <p>cwd（absPath）以 webPath 为准——前端常是问题入口；webPath 缺省时退回 codePath。
     * relPath 跟随被选作 cwd 的那个路径，使工作台展示与会话实际进入目录一致。
     * codePath 与 webPath 均做越界校验；两者都缺/越界则该模块作废返回 null。</p>
     */
    private ModuleView toModuleView(Path root, KbModule m) {
        if (m == null) return null;
        Path codeAbs = safeResolve(root, m.codePath());
        Path webAbs = safeResolve(root, m.webPath());
        // cwd 优先前端目录，无则后端目录。
        Path cwd = webAbs != null ? webAbs : codeAbs;
        if (cwd == null) {
            log.debug("知识库 {} 模块 codePath/webPath 均缺失或越界，跳过: {}", KB_MODULES_FILE, m.key());
            return null;
        }
        String relStr = root.relativize(cwd).toString().replace('\\', '/');
        String moduleName = (m.name() == null || m.name().isBlank()) ? cwd.getFileName().toString() : m.name();
        List<ModuleView> children = new ArrayList<>();
        if (m.children() != null) {
            for (KbModule c : m.children()) {
                ModuleView cv = toModuleView(root, c);
                if (cv != null) children.add(cv);
            }
        }
        return new ModuleView(moduleName, relStr, cwd.toString(), "knowledge",
                m.summary() == null ? "" : m.summary(), List.copyOf(children));
    }

    /** 解析相对项目根的路径并做越界校验；空/越界返回 null。 */
    private Path safeResolve(Path root, String rel) {
        if (rel == null || rel.isBlank()) return null;
        Path abs = root.resolve(rel.replace('\\', '/')).normalize();
        if (!abs.startsWith(root)) {
            log.debug("知识库 {} 中路径越界，忽略: {}", KB_MODULES_FILE, rel);
            return null;
        }
        return abs;
    }

    /** 知识库 modules.json 顶层结构。 */
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    private record KnowledgeModules(List<KbModule> modules) {
    }

    /** 一条知识库模块声明：key/name 业务名，codePath 后端目录、webPath 前端目录(相对项目根)，children 嵌套子模块。 */
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    private record KbModule(String key, String name, String codePath, String webPath, String summary,
                            List<KbModule> children) {
    }

    private void collectModules(Path projectRoot, Path dir, int depth, List<ModuleView> out) {
        String type = detectModuleType(dir);
        if (type != null) {
            Path rel = projectRoot.relativize(dir);
            String relStr = rel.toString().isEmpty() ? "." : rel.toString().replace('\\', '/');
            out.add(new ModuleView(dir.getFileName().toString(), relStr, dir.toString(), type, "", List.of()));
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
