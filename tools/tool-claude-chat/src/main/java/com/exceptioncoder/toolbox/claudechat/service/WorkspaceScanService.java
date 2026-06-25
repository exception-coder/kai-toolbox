package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ModuleResolveResponse;
import com.exceptioncoder.toolbox.claudechat.api.dto.ModuleResolveResponse.Candidate;
import com.exceptioncoder.toolbox.claudechat.api.dto.ProjectModulesResponse;
import com.exceptioncoder.toolbox.claudechat.api.dto.ProjectModulesResponse.ModuleView;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceDirView;
import com.exceptioncoder.toolbox.claudechat.api.dto.CloneResponse;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse.RootView;
import com.exceptioncoder.toolbox.claudechat.config.WorkspaceProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
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

    /**
     * 拉取（git clone）新项目到指定工作区根。root 必须是配置的 workspace 根之一（防越权写任意目录）；
     * 仓库名从 url 推导并校验（防路径穿越）；目标已存在则拒绝。成功后失效扫描缓存，使新目录立即可选。
     * 同步执行（git clone 较慢，由虚拟线程承载请求），失败抛 IllegalArgumentException 携带 git 输出尾部。
     */
    public CloneResponse cloneProject(String url, String root) {
        String u = url == null ? "" : url.trim();
        if (u.isBlank()) {
            throw new IllegalArgumentException("git 地址不能为空");
        }
        if (!u.matches("(?i)^(https?://|git://|ssh://|git@).+")) {
            throw new IllegalArgumentException("git 地址格式不支持（仅 http(s)/git/ssh）: " + u);
        }
        Path rootPath = resolveAllowedRoot(root);
        String name = repoNameFromUrl(u);
        Path target = rootPath.resolve(name).normalize();
        if (!target.getParent().equals(rootPath)) {
            throw new IllegalArgumentException("非法仓库名: " + name);
        }
        if (Files.exists(target)) {
            throw new IllegalArgumentException("目标已存在，跳过: " + target);
        }
        try {
            Files.createDirectories(rootPath);
        } catch (IOException e) {
            throw new IllegalArgumentException("工作区根不可写: " + e.getMessage());
        }

        ProcessBuilder pb = new ProcessBuilder("git", "clone", "--progress", u, target.toString())
                .redirectErrorStream(true);
        StringBuilder out = new StringBuilder();
        try {
            Process p = pb.start();
            try (BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = br.readLine()) != null) {
                    out.append(line).append('\n');
                }
            }
            boolean done = p.waitFor(600, TimeUnit.SECONDS);
            if (!done) {
                p.destroyForcibly();
                throw new IllegalArgumentException("git clone 超时（>10min），已终止");
            }
            if (p.exitValue() != 0) {
                String tail = out.length() > 600 ? out.substring(out.length() - 600) : out.toString();
                throw new IllegalArgumentException("git clone 失败: " + tail.trim());
            }
        } catch (IOException e) {
            throw new IllegalArgumentException("git clone 启动失败（git 是否在 PATH？）: " + e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalArgumentException("git clone 被中断");
        }
        cacheExpireAt = 0; // 失效缓存：新克隆目录下次扫描即出现在工作区下拉
        log.info("[claude-chat] 已克隆 {} -> {}", u, target);
        return new CloneResponse(name, target.toString());
    }

    /** 校验 root 是配置的 workspace 根之一并返回规范化路径；否则拒绝（防写任意目录）。 */
    private Path resolveAllowedRoot(String root) {
        if (root == null || root.isBlank()) {
            throw new IllegalArgumentException("请选择工作区");
        }
        Path want = Path.of(root).toAbsolutePath().normalize();
        for (String r : props.getRoots()) {
            if (r == null || r.isBlank()) continue;
            if (Path.of(r).toAbsolutePath().normalize().equals(want)) {
                return want;
            }
        }
        throw new IllegalArgumentException("工作区不在允许范围: " + root);
    }

    /** 从 git url 推导仓库目录名（去末段 .git / 查询串），并校验仅含安全字符。 */
    private String repoNameFromUrl(String url) {
        String s = url;
        int hash = s.indexOf('#'); if (hash >= 0) s = s.substring(0, hash);
        int q = s.indexOf('?'); if (q >= 0) s = s.substring(0, q);
        s = s.replaceAll("[/\\\\]+$", "");                 // 去尾部斜杠
        int slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf(':')); // scp 风格 host:path
        String last = slash >= 0 ? s.substring(slash + 1) : s;
        if (last.endsWith(".git")) last = last.substring(0, last.length() - 4);
        if (!last.matches("[A-Za-z0-9._-]+") || last.equals(".") || last.equals("..")) {
            throw new IllegalArgumentException("无法从地址解析出合法仓库名: " + url);
        }
        return last;
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

    // ===== 模块路由：把一句自然语言解析为候选 (项目, 模块)，供「模块路由」拉起会话 =====

    /** 自然语言中的填充词（含动作/指代/量词），剥离后剩下的才是用于匹配模块的关键片段。按长度降序删，避免短词先吃掉长词。 */
    private static final List<String> FILLER = List.of(
            "帮我开发", "我想开发", "我要开发", "去开发", "开发一下", "切换到", "跳转到", "进入到",
            "帮我", "我想", "我要", "请帮", "麻烦", "顺便", "现在", "接下来",
            "开发", "进入", "打开", "拉起", "启动", "开始", "切到", "切换", "定位", "找到", "去做", "做一下",
            "会话", "模块", "工程", "服务", "项目", "代码", "那个", "这个", "一下", "给我", "让我", "下的", "里的",
            "的", "去", "搞", "弄", "改", "修", "看", "来", "和", "与");
    /** 英文填充词（按整词删，避免吃掉 module 名子串）。 */
    private static final Set<String> FILLER_EN = Set.of(
            "develop", "dev", "open", "start", "go", "goto", "into", "the", "a", "an",
            "module", "project", "service", "repo", "lets", "let", "please", "to", "of", "in", "for");

    /**
     * 解析一句自然语言为候选 (项目, 模块)。全确定性：
     * <ol>
     *   <li>识别项目提示：输入中若出现某个项目目录名（≥2 字），记为 projectHint（取最长命中）；</li>
     *   <li>剥离项目名 + 填充词，剩余片段为 moduleHint；</li>
     *   <li>遍历各项目模块（含嵌套子模块）做归一化匹配：精确 > 前缀 > 包含；命中 projectHint 的项目额外加权前置；</li>
     *   <li>moduleHint 为空但有 projectHint 时，返回该项目全部模块供选择。</li>
     * </ol>
     * 返回候选按得分降序、截断到 20 个。0 个=未匹配，1 个=可直接确认，多个=需用户选项目。
     */
    public ModuleResolveResponse resolveModule(String query) {
        String raw = query == null ? "" : query.trim();
        if (raw.isEmpty()) return new ModuleResolveResponse("", "", "", List.of());

        WorkspaceListResponse ws = scan();
        // 1) 项目提示：输入里出现的最长项目目录名
        String lower = raw.toLowerCase();
        String projectHint = "";
        for (RootView root : ws.roots()) {
            for (WorkspaceDirView dir : root.dirs()) {
                String n = dir.name();
                if (n != null && n.length() >= 2 && lower.contains(n.toLowerCase()) && n.length() > projectHint.length()) {
                    projectHint = n;
                }
            }
        }
        // 2) 剥离项目名 + 填充词 → moduleHint
        String moduleHint = stripToHint(raw, projectHint);

        // 3) 遍历项目匹配
        List<Scored> scored = new ArrayList<>();
        for (RootView root : ws.roots()) {
            if (!root.exists()) continue;
            for (WorkspaceDirView dir : root.dirs()) {
                boolean projectMatch = !projectHint.isEmpty() && dir.name().equalsIgnoreCase(projectHint);
                // 有项目提示时，只在该项目内找（定位更准）；无提示则全工作区找
                if (!projectHint.isEmpty() && !projectMatch) continue;
                ProjectModulesResponse pm = scanModules(dir.path());
                if (!pm.exists()) continue;
                List<ModuleView> flat = new ArrayList<>();
                flatten(pm.modules(), flat);
                for (ModuleView m : flat) {
                    String match = matchKind(m, moduleHint);
                    if (match == null) continue;
                    int score = "exact".equals(match) ? 3 : "prefix".equals(match) ? 2 : 1;
                    if (projectMatch) score += 10;
                    scored.add(new Scored(new Candidate(dir.name(), dir.path(), m, match), score));
                }
            }
        }
        scored.sort(Comparator.comparingInt(Scored::score).reversed());
        List<Candidate> candidates = scored.stream().limit(20).map(Scored::candidate).toList();
        return new ModuleResolveResponse(raw, moduleHint, projectHint, candidates);
    }

    private record Scored(Candidate candidate, int score) {
    }

    /** 删项目名与填充词，返回小写归一的模块关键片段。 */
    private String stripToHint(String raw, String projectHint) {
        String s = raw.toLowerCase();
        if (!projectHint.isEmpty()) s = s.replace(projectHint.toLowerCase(), " ");
        for (String f : FILLER) s = s.replace(f, " ");
        // 英文填充词按整词删
        StringBuilder sb = new StringBuilder();
        for (String tok : s.split("[\\s,，。.、:：/\\\\#@!！?？\"'（）()\\[\\]]+")) {
            if (tok.isBlank() || FILLER_EN.contains(tok)) continue;
            if (!sb.isEmpty()) sb.append(' ');
            sb.append(tok);
        }
        return sb.toString().trim();
    }

    /** 模块对 hint 的命中方式；不命中返回 null。hint 为空表示「无模块关键词」，一律视为弱命中（contains）以便列项目全部模块。 */
    private String matchKind(ModuleView m, String hint) {
        if (hint.isBlank()) return "contains";
        String name = m.name() == null ? "" : m.name().toLowerCase();
        String rel = m.relPath() == null ? "" : m.relPath().toLowerCase();
        for (String h : hint.split("\\s+")) {
            if (h.isBlank()) continue;
            if (name.equals(h)) return "exact";
            if (name.startsWith(h) || h.startsWith(name) && name.length() >= 2) return "prefix";
            if (name.contains(h) || rel.contains(h)) return "contains";
        }
        return null;
    }

    /** 递归展平模块树（父 + 所有子）。 */
    private void flatten(List<ModuleView> modules, List<ModuleView> out) {
        if (modules == null) return;
        for (ModuleView m : modules) {
            out.add(m);
            flatten(m.children(), out);
        }
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
