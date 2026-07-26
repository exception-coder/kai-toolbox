package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.domain.CleanupRecipe;
import com.exceptioncoder.toolbox.treesize.domain.CleanupSafety;
import com.exceptioncoder.toolbox.treesize.domain.RecipeKind;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The declared set of dev-machine cleanup recipes, plus the only code path that turns a
 * recipe into concrete on-disk paths.
 *
 * <p>Two invariants make this feature safe to expose over HTTP:
 * <ol>
 *   <li>The catalog is a compile-time constant. Callers pass a recipe id; they can never pass
 *       a path. Whatever this class refuses to resolve simply cannot be deleted.</li>
 *   <li>Every resolved path goes through {@link #permitted(Path)}, which rejects anything at
 *       or above a protected location — including the case where the target is an
 *       <em>ancestor</em> of something protected.</li>
 * </ol>
 */
@Component
public class DevCleanCatalog {

    private static final Logger log = LoggerFactory.getLogger(DevCleanCatalog.class);

    /** {@code %NAME%} env placeholder in a target template. */
    private static final Pattern ENV_TOKEN = Pattern.compile("%([A-Za-z_][A-Za-z0-9_()]*)%");

    /**
     * A versioned extension folder: {@code publisher.name-1.2.3} / {@code publisher.name-1.2.3-win32-x64}.
     * The version must start with a digit so a publisher id containing a dash
     * ({@code ms-python.python}) is not mistaken for a version boundary.
     */
    private static final Pattern VERSIONED_ENTRY = Pattern.compile("^(?<name>.+)-(?<version>\\d[^-]*(?:-.*)?)$");

    /**
     * Minimum path depth we will ever delete. {@code C:\} is 0 segments, {@code C:\Users} is 1 —
     * both are refused outright regardless of what a recipe claims.
     */
    private static final int MIN_DEPTH = 2;

    private static final List<CleanupRecipe> RECIPES = buildRecipes();

    public List<CleanupRecipe> all() {
        return RECIPES;
    }

    public Optional<CleanupRecipe> find(String id) {
        return RECIPES.stream().filter(r -> r.id().equals(id)).findFirst();
    }

    /**
     * Expand a recipe's templates into absolute paths that exist right now and pass the
     * denylist. Missing env vars, missing directories and refused paths are dropped silently
     * (they are the normal case: no pnpm installed, no Chrome profile 2, running on Linux).
     */
    public List<Path> resolveTargets(CleanupRecipe recipe) {
        List<Path> out = new ArrayList<>();
        for (String template : recipe.targets()) {
            String expanded = expandEnv(template);
            if (expanded == null) {
                continue;
            }
            for (Path candidate : expandGlob(expanded)) {
                if (!Files.isDirectory(candidate)) {
                    continue;
                }
                Path normalized = candidate.toAbsolutePath().normalize();
                if (!permitted(normalized)) {
                    log.warn("devclean: recipe {} target refused by denylist: {}", recipe.id(), normalized);
                    continue;
                }
                if (!out.contains(normalized)) {
                    out.add(normalized);
                }
            }
        }
        return out;
    }

    /**
     * Within a {@link RecipeKind#VERSIONED_DIR} container, the entries that are <em>not</em>
     * among the newest {@code keepLatest} of their name.
     *
     * <p>Entries whose name does not parse as {@code <name>-<version>} are left alone — an
     * unparseable folder is more likely to be something we do not understand than garbage.
     */
    public List<Path> obsoleteVersions(Path container, int keepLatest) {
        java.util.Map<String, List<Path>> byName = new java.util.LinkedHashMap<>();
        try (DirectoryStream<Path> entries = Files.newDirectoryStream(container)) {
            for (Path entry : entries) {
                if (!Files.isDirectory(entry)) {
                    continue;
                }
                Matcher m = VERSIONED_ENTRY.matcher(entry.getFileName().toString());
                if (!m.matches()) {
                    continue;
                }
                byName.computeIfAbsent(m.group("name").toLowerCase(Locale.ROOT), k -> new ArrayList<>())
                        .add(entry);
            }
        } catch (IOException e) {
            log.warn("devclean: cannot list versioned container {}: {}", container, e.toString());
            return List.of();
        }

        List<Path> obsolete = new ArrayList<>();
        for (List<Path> group : byName.values()) {
            if (group.size() <= keepLatest) {
                continue;
            }
            group.sort((a, b) -> compareVersions(versionOf(b), versionOf(a)));
            obsolete.addAll(group.subList(keepLatest, group.size()));
        }
        return obsolete;
    }

    /**
     * Reject paths that are protected, too shallow, or an ancestor of something protected.
     *
     * <p>Two distinct rules, because the profile roots cannot use the same one as the
     * forbidden subtrees — {@code %APPDATA%} is an ancestor of nearly every recipe target, so
     * treating it as a forbidden subtree would refuse the entire catalog:
     * <ul>
     *   <li>{@link #forbiddenSubtrees()} — refuse the path itself, anything under it, and
     *       anything above it. Nothing in these trees is ever deletable.</li>
     *   <li>{@link #containerRoots()} — refuse only the root itself and its ancestors.
     *       Descendants are fine; the point is that a badly expanded template (empty
     *       {@code *} segment, env var resolving to a drive root) must not hand us
     *       {@code C:\Users\x} and take the whole profile with it.</li>
     * </ul>
     */
    boolean permitted(Path path) {
        if (!path.isAbsolute() || path.getNameCount() < MIN_DEPTH) {
            return false;
        }
        for (Path forbidden : forbiddenSubtrees()) {
            if (path.startsWith(forbidden) || forbidden.startsWith(path)) {
                return false;
            }
        }
        for (Path root : containerRoots()) {
            if (root.startsWith(path)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Trees this feature must never touch at any depth. {@code Code\User} holds settings.json /
     * keybindings / snippets / profiles — configuration that no cache rebuild brings back — so
     * it is protected even though its siblings under {@code Code\} are exactly what we clean.
     */
    private List<Path> forbiddenSubtrees() {
        List<Path> out = new ArrayList<>();
        addIfResolvable(out, "%SystemRoot%");
        addIfResolvable(out, "%ProgramFiles%");
        addIfResolvable(out, "%ProgramFiles(x86)%");
        addIfResolvable(out, "%ProgramData%");
        addIfResolvable(out, "%APPDATA%\\Code\\User");
        addIfResolvable(out, "%USERPROFILE%\\.ssh");
        addIfResolvable(out, "%USERPROFILE%\\.aws");
        addIfResolvable(out, "%USERPROFILE%\\.kai-toolbox");
        return out;
    }

    /** Roots that may be traversed into but never deleted themselves. */
    private List<Path> containerRoots() {
        List<Path> out = new ArrayList<>();
        addIfResolvable(out, "%USERPROFILE%");
        addIfResolvable(out, "%APPDATA%");
        addIfResolvable(out, "%LOCALAPPDATA%");
        return out;
    }

    private static void addIfResolvable(List<Path> out, String template) {
        String expanded = expandEnv(template);
        if (expanded == null) {
            return;
        }
        try {
            out.add(Path.of(expanded).toAbsolutePath().normalize());
        } catch (InvalidPathException ignored) {
            // Not a usable path on this platform — nothing to protect.
        }
    }

    /** Returns null when any placeholder is unset, meaning "this recipe does not apply here". */
    private static String expandEnv(String template) {
        Matcher m = ENV_TOKEN.matcher(template);
        StringBuilder sb = new StringBuilder();
        int last = 0;
        while (m.find()) {
            String value = System.getenv(m.group(1));
            if (value == null || value.isBlank()) {
                return null;
            }
            sb.append(template, last, m.start()).append(value);
            last = m.end();
        }
        sb.append(template.substring(last));
        return sb.toString();
    }

    /**
     * Expand {@code *} segments by listing directories. Only whole-segment wildcards are
     * supported; that covers per-profile ({@code Chrome\User Data\*\Cache}) and per-IDE
     * ({@code JetBrains\*\caches}) layouts without pulling in a glob engine.
     */
    private static List<Path> expandGlob(String expanded) {
        if (!expanded.contains("*")) {
            try {
                return List.of(Path.of(expanded));
            } catch (InvalidPathException e) {
                return List.of();
            }
        }
        int star = expanded.indexOf('*');
        int prefixEnd = Math.max(expanded.lastIndexOf('\\', star), expanded.lastIndexOf('/', star));
        int suffixStart = indexOfSeparator(expanded, star);
        if (prefixEnd < 0) {
            return List.of();
        }
        String prefix = expanded.substring(0, prefixEnd);
        String segmentPattern = expanded.substring(prefixEnd + 1, suffixStart < 0 ? expanded.length() : suffixStart);
        String suffix = suffixStart < 0 ? "" : expanded.substring(suffixStart + 1);

        Path base;
        try {
            base = Path.of(prefix);
        } catch (InvalidPathException e) {
            return List.of();
        }
        if (!Files.isDirectory(base)) {
            return List.of();
        }
        Pattern segment = Pattern.compile(
                "^" + Pattern.quote(segmentPattern).replace("*", "\\E.*\\Q") + "$",
                Pattern.CASE_INSENSITIVE);

        List<Path> out = new ArrayList<>();
        try (DirectoryStream<Path> children = Files.newDirectoryStream(base)) {
            for (Path child : children) {
                if (!Files.isDirectory(child) || !segment.matcher(child.getFileName().toString()).matches()) {
                    continue;
                }
                if (suffix.isEmpty()) {
                    out.add(child);
                } else {
                    out.addAll(expandGlob(child.resolve(suffix).toString()));
                }
            }
        } catch (IOException e) {
            log.debug("devclean: cannot expand glob under {}: {}", base, e.toString());
        }
        return out;
    }

    private static int indexOfSeparator(String s, int from) {
        int back = s.indexOf('\\', from);
        int fwd = s.indexOf('/', from);
        if (back < 0) return fwd;
        if (fwd < 0) return back;
        return Math.min(back, fwd);
    }

    private static String versionOf(Path entry) {
        Matcher m = VERSIONED_ENTRY.matcher(entry.getFileName().toString());
        return m.matches() ? m.group("version") : "0";
    }

    /** Numeric-segment compare; non-numeric tails fall back to a case-insensitive string compare. */
    static int compareVersions(String a, String b) {
        String[] as = a.split("[.\\-+]");
        String[] bs = b.split("[.\\-+]");
        for (int i = 0; i < Math.max(as.length, bs.length); i++) {
            String ap = i < as.length ? as[i] : "";
            String bp = i < bs.length ? bs[i] : "";
            Integer an = asInt(ap);
            Integer bn = asInt(bp);
            int cmp = (an != null && bn != null)
                    ? Integer.compare(an, bn)
                    : ap.compareToIgnoreCase(bp);
            if (cmp != 0) {
                return cmp;
            }
        }
        return 0;
    }

    private static Integer asInt(String s) {
        if (s.isEmpty()) {
            return null;
        }
        try {
            return Integer.valueOf(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // ------------------------------------------------------------------------------------
    // The catalog itself. Adding a directory here is the ONLY way to make it deletable.
    // ------------------------------------------------------------------------------------

    private static List<CleanupRecipe> buildRecipes() {
        List<CleanupRecipe> r = new ArrayList<>();

        // ---- VS Code -------------------------------------------------------------------
        r.add(CleanupRecipe.builder()
                .id("vscode-extension-old-versions")
                .group("VS Code")
                .title("插件历史版本（每个插件保留最新一版）")
                .kind(RecipeKind.VERSIONED_DIR)
                .safety(CleanupSafety.SAFE)
                .targets(List.of("%USERPROFILE%\\.vscode\\extensions"))
                .keepLatest(1)
                .note("升级插件时旧版本目录不会被删除，同一插件常堆积十几个版本。保留最新版即可，"
                        + "无法解析出版本号的目录一律不动。")
                .build());
        r.add(CleanupRecipe.builder()
                .id("vscode-cacheddata")
                .group("VS Code")
                .title("CachedData（V8 代码缓存）")
                .kind(RecipeKind.DIR_CONTENTS)
                .safety(CleanupSafety.SAFE)
                .targets(List.of("%APPDATA%\\Code\\CachedData"))
                .note("Electron/V8 为每个版本生成的编译缓存，升级后旧版残留不会清。下次启动自动重建，"
                        + "代价只是首次启动稍慢。")
                .build());
        r.add(CleanupRecipe.builder()
                .id("vscode-http-cache")
                .group("VS Code")
                .title("Cache / Code Cache / GPUCache")
                .kind(RecipeKind.DIR_CONTENTS)
                .safety(CleanupSafety.SAFE)
                .targets(List.of(
                        "%APPDATA%\\Code\\Cache",
                        "%APPDATA%\\Code\\Code Cache",
                        "%APPDATA%\\Code\\GPUCache"))
                .note("Chromium 侧的网络缓存、脚本缓存与 GPU shader 缓存，全部可重建。")
                .build());
        r.add(CleanupRecipe.builder()
                .id("vscode-service-worker")
                .group("VS Code")
                .title("Service Worker 缓存")
                .kind(RecipeKind.DIR_CONTENTS)
                .safety(CleanupSafety.SAFE)
                .targets(List.of(
                        "%APPDATA%\\Code\\Service Worker\\CacheStorage",
                        "%APPDATA%\\Code\\Service Worker\\ScriptCache"))
                .note("Webview（Markdown 预览、扩展面板等）的离线缓存。")
                .build());
        r.add(CleanupRecipe.builder()
                .id("vscode-logs")
                .group("VS Code")
                .title("日志目录")
                .kind(RecipeKind.DIR_CONTENTS)
                .safety(CleanupSafety.SAFE)
                .targets(List.of("%APPDATA%\\Code\\logs"))
                .note("每次启动新建一个时间戳子目录且不自动回收，装了语言服务器/AI 插件后增长很快。")
                .build());

        // ---- AI 桌面端（Electron，缓存结构同 VS Code）--------------------------------------
        r.add(CleanupRecipe.builder()
                .id("claude-desktop-cache")
                .group("AI 桌面端")
                .title("Claude Desktop 缓存")
                .kind(RecipeKind.DIR_CONTENTS)
                .safety(CleanupSafety.SAFE)
                .targets(List.of(
                        "%APPDATA%\\Claude\\Cache",
                        "%APPDATA%\\Claude\\Code Cache",
                        "%APPDATA%\\Claude\\GPUCache",
                        "%APPDATA%\\Claude\\logs"))
                .note("只清缓存与日志，不动登录态与设置。")
                .build());
        r.add(CleanupRecipe.builder()
                .id("chatgpt-desktop-cache")
                .group("AI 桌面端")
                .title("ChatGPT Desktop 缓存")
                .kind(RecipeKind.DIR_CONTENTS)
                .safety(CleanupSafety.SAFE)
                .targets(List.of(
                        "%APPDATA%\\ChatGPT\\Cache",
                        "%APPDATA%\\ChatGPT\\Code Cache",
                        "%APPDATA%\\ChatGPT\\GPUCache",
                        "%LOCALAPPDATA%\\ChatGPT\\Cache",
                        "%LOCALAPPDATA%\\ChatGPT\\Code Cache"))
                .note("只清缓存，不动 settings。")
                .build());

        // ---- 包管理器缓存 ----------------------------------------------------------------
        r.add(CleanupRecipe.builder()
                .id("npm-cache")
                .group("包管理器")
                .title("npm 缓存 (_cacache)")
                .kind(RecipeKind.DIR_CONTENTS)
                .safety(CleanupSafety.SAFE)
                .targets(List.of(
                        "%LOCALAPPDATA%\\npm-cache\\_cacache",
                        "%APPDATA%\\npm-cache\\_cacache"))
                .note("等价于 npm cache clean --force。只清 _cacache 子目录，保留 npm 自身配置。")
                .build());
        r.add(CleanupRecipe.builder()
                .id("yarn-cache")
                .group("包管理器")
                .title("Yarn 缓存")
                .kind(RecipeKind.DIR_CONTENTS)
                .safety(CleanupSafety.SAFE)
                .targets(List.of("%LOCALAPPDATA%\\Yarn\\Cache"))
                .note("等价于 yarn cache clean。")
                .build());
        r.add(CleanupRecipe.builder()
                .id("pip-cache")
                .group("包管理器")
                .title("pip 缓存")
                .kind(RecipeKind.DIR_CONTENTS)
                .safety(CleanupSafety.SAFE)
                .targets(List.of("%LOCALAPPDATA%\\pip\\Cache"))
                .note("等价于 pip cache purge。")
                .build());
        r.add(CleanupRecipe.builder()
                .id("gradle-caches")
                .group("包管理器")
                .title("Gradle 构建缓存")
                .kind(RecipeKind.DIR_CONTENTS)
                .safety(CleanupSafety.REVIEW)
                .targets(List.of(
                        "%USERPROFILE%\\.gradle\\caches\\build-cache-1",
                        "%USERPROFILE%\\.gradle\\caches\\transforms-3",
                        "%USERPROFILE%\\.gradle\\caches\\transforms-4",
                        "%USERPROFILE%\\.gradle\\daemon"))
                .note("只清构建缓存与 daemon 日志，不动 caches/modules-2 依赖仓库（那部分重下代价高）。"
                        + "Android 项目下次构建会明显变慢。")
                .build());

        // ---- IDE -----------------------------------------------------------------------
        r.add(CleanupRecipe.builder()
                .id("jetbrains-caches")
                .group("IDE")
                .title("JetBrains 索引缓存与日志")
                .kind(RecipeKind.DIR_CONTENTS)
                .safety(CleanupSafety.REVIEW)
                .targets(List.of(
                        "%LOCALAPPDATA%\\JetBrains\\*\\caches",
                        "%LOCALAPPDATA%\\JetBrains\\*\\log",
                        "%LOCALAPPDATA%\\JetBrains\\*\\tmp"))
                .note("清掉后 IDEA 下次打开会重建索引（大项目可能几分钟）。不动 %APPDATA%\\JetBrains 下的配置。"
                        + "建议 IDEA 关闭后再清，否则大量文件被占用。")
                .build());

        // ---- 系统临时文件 ----------------------------------------------------------------
        r.add(CleanupRecipe.builder()
                .id("user-temp")
                .group("系统临时文件")
                .title("用户 TEMP 目录")
                .kind(RecipeKind.DIR_CONTENTS)
                .safety(CleanupSafety.SAFE)
                .targets(List.of("%TEMP%"))
                .note("正在运行的程序持有的临时文件会删除失败并被跳过，属正常现象。注意这里也是 "
                        + "Claude Code / Codex 等 CLI 放会话临时目录的位置，清理会中断正在进行的会话产物。")
                .build());
        r.add(CleanupRecipe.builder()
                .id("crash-dumps")
                .group("系统临时文件")
                .title("崩溃转储 (CrashDumps)")
                .kind(RecipeKind.DIR_CONTENTS)
                .safety(CleanupSafety.SAFE)
                .targets(List.of("%LOCALAPPDATA%\\CrashDumps"))
                .note("单个 dump 可达数百 MB，除非正在排查崩溃否则无保留价值。")
                .build());

        // ---- 浏览器 ---------------------------------------------------------------------
        r.add(CleanupRecipe.builder()
                .id("chrome-cache")
                .group("浏览器")
                .title("Chrome 缓存（全部配置文件）")
                .kind(RecipeKind.DIR_CONTENTS)
                .safety(CleanupSafety.SAFE)
                .targets(List.of(
                        "%LOCALAPPDATA%\\Google\\Chrome\\User Data\\*\\Cache",
                        "%LOCALAPPDATA%\\Google\\Chrome\\User Data\\*\\Code Cache",
                        "%LOCALAPPDATA%\\Google\\Chrome\\User Data\\*\\GPUCache"))
                .note("不动 Cookies / 登录态 / 书签。浏览器运行时部分文件会被占用而跳过。")
                .build());
        r.add(CleanupRecipe.builder()
                .id("edge-cache")
                .group("浏览器")
                .title("Edge 缓存（全部配置文件）")
                .kind(RecipeKind.DIR_CONTENTS)
                .safety(CleanupSafety.SAFE)
                .targets(List.of(
                        "%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\*\\Cache",
                        "%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\*\\Code Cache",
                        "%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\*\\GPUCache"))
                .note("不动 Cookies / 登录态 / 书签。")
                .build());

        // ---- 只测量、不代执行 -------------------------------------------------------------
        // 这些要么需要专用工具才能安全回收（硬链接 store、Docker 分层），要么会中断正在运行的东西
        // （wsl --shutdown）。我们报体积 + 给命令，执行权留给用户。
        r.add(CleanupRecipe.builder()
                .id("advisory-recycle-bin")
                .group("需要手动执行")
                .title("清空回收站")
                .kind(RecipeKind.ADVISORY)
                .safety(CleanupSafety.REVIEW)
                .targets(List.of())
                .advisoryCommand("Clear-RecycleBin -Force")
                .note("本面板所有删除都先进回收站，所以清理后空间不会立刻释放 —— 必须再清一次回收站才算真正回收。"
                        + "确认误删的东西都不需要了再执行。")
                .build());
        r.add(CleanupRecipe.builder()
                .id("advisory-pnpm-store")
                .group("需要手动执行")
                .title("pnpm store 瘦身")
                .kind(RecipeKind.ADVISORY)
                .safety(CleanupSafety.REVIEW)
                .targets(List.of("%LOCALAPPDATA%\\pnpm-store", "%USERPROFILE%\\.pnpm-store"))
                .advisoryCommand("pnpm store prune")
                .note("store 里的包被各项目 node_modules 以硬链接引用，直接删目录会让现有项目的依赖变成坏链接。"
                        + "必须用 prune 让 pnpm 自己判断哪些已无人引用。")
                .build());
        r.add(CleanupRecipe.builder()
                .id("advisory-maven-repo")
                .group("需要手动执行")
                .title("Maven 本地仓库")
                .kind(RecipeKind.ADVISORY)
                .safety(CleanupSafety.REVIEW)
                .targets(List.of("%USERPROFILE%\\.m2\\repository"))
                .advisoryCommand("# 按最后访问时间清理，而不是整删：\n"
                        + "Get-ChildItem \"$env:USERPROFILE\\.m2\\repository\" -Recurse -Include *.jar "
                        + "| Where-Object { $_.LastAccessTime -lt (Get-Date).AddDays(-180) }")
                .note("整删会让所有 Java 项目下次构建全量重下（本机是 Java 主力机，净负收益）。"
                        + "只故意不提供一键删除按钮。")
                .build());
        r.add(CleanupRecipe.builder()
                .id("advisory-docker")
                .group("需要手动执行")
                .title("Docker 镜像 / 容器 / build cache")
                .kind(RecipeKind.ADVISORY)
                .safety(CleanupSafety.DANGEROUS)
                .targets(List.of())
                .advisoryCommand("docker system df\ndocker system prune -a")
                .note("Docker 的分层存储必须由 Docker 自己回收，直接删目录会损坏 daemon 状态。"
                        + "本工作台已有独立的 Docker 工具，请到那里操作。")
                .build());
        r.add(CleanupRecipe.builder()
                .id("advisory-wsl")
                .group("需要手动执行")
                .title("WSL 虚拟磁盘压缩")
                .kind(RecipeKind.ADVISORY)
                .safety(CleanupSafety.DANGEROUS)
                .targets(List.of())
                .advisoryCommand("wsl --shutdown\nOptimize-VHD -Path <ext4.vhdx 路径> -Mode Full")
                .note("ext4.vhdx 只增不减，删了文件也不还给 Windows。但压缩前必须 wsl --shutdown，"
                        + "会中断 WSL 里正在跑的一切 —— 因此本工具只提示，不代执行。")
                .build());

        return List.copyOf(r);
    }
}
