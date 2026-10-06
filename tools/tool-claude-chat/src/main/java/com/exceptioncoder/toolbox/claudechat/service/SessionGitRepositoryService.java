package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.GitRepoRefView;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

/** 会话 Git 仓库投影；目录关联仍由 SessionProjectDirectoryService 持久化。 */
@Service
public class SessionGitRepositoryService {
    private static final int MAX_PARENT_DEPTH = 10;
    private static final String LINKED_PREFIX = "linked:";
    private final ClaudeChatSessionRepository sessions;
    private final SessionProjectDirectoryService directories;
    private final ProjectAccess access;

    public SessionGitRepositoryService(ClaudeChatSessionRepository sessions,
            SessionProjectDirectoryService directories, ProjectAccess access) {
        this.sessions = sessions;
        this.directories = directories;
        this.access = access;
    }

    /** 生成主目录与已关联仓库的去重投影。 */
    public List<GitRepoRefView> list(String sessionId) {
        Path base = sessionCwd(sessionId);
        Map<Path, GitRepoRefView> result = new LinkedHashMap<>();
        Path primary = isRepo(base) ? base : findParentRepo(base);
        if (primary != null) {
            add(result, primary, "", true);
        } else {
            for (Path child : subRepos(base)) {
                add(result, child, child.getFileName().toString(), false);
            }
        }
        for (String linked : directories.list(sessionId)) {
            Path dir = Path.of(linked).toAbsolutePath().normalize();
            if (!Files.isDirectory(dir) || !access.allowed(dir)) {
                continue;
            }
            for (Path root : linkedRepos(dir)) {
                add(result, root, linkedKey(root.toString()), false);
            }
        }
        return List.copyOf(result.values());
    }

    /** 查询时重新核对目录归属和排除策略。 */
    public Path resolve(String sessionId, String selection) {
        // 每次重新读取关联；标识不是任意路径，也不因列表缓存而保留访问权。
        Path target;
        if (selection != null && selection.startsWith(LINKED_PREFIX)) {
            sessionCwd(sessionId);
            target = directories.list(sessionId).stream()
                    .map(path -> Path.of(path).toAbsolutePath().normalize())
                    .filter(path -> Files.isDirectory(path) && access.allowed(path))
                    .flatMap(path -> linkedRepos(path).stream())
                    .filter(path -> linkedKey(path.toString()).equals(selection)).findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("仓库已解除关联，请刷新并重新选择"));
        } else {
            target = resolvePrimary(sessionId, selection);
        }
        access.requireAllowed(target);
        Path canonical = realPath(target);
        access.requireAllowed(canonical);
        return canonical;
    }

    /** 关联集合目录沿用主目录的自身、父仓库、直接子仓库顺序，不递归扩大范围。 */
    private List<Path> linkedRepos(Path dir) {
        Path root = isRepo(dir) ? dir : findParentRepo(dir);
        return root != null ? List.of(root) : subRepos(dir);
    }

    private void add(Map<Path, GitRepoRefView> result, Path path, String key, boolean primary) {
        if (!access.allowed(path)) {
            return;
        }
        Path canonical = realPath(path);
        if (!access.allowed(canonical)) {
            return;
        }
        result.putIfAbsent(canonical, new GitRepoRefView(key,
                path.getFileName() + (primary ? "（主目录）" : " · " + path), primary));
    }

    private static String linkedKey(String path) {
        String normalized = Path.of(path).toAbsolutePath().normalize().toString();
        if (System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win")) {
            normalized = normalized.toLowerCase(Locale.ROOT);
        }
        return LINKED_PREFIX + UUID.nameUUIDFromBytes(normalized.getBytes(StandardCharsets.UTF_8));
    }

    private static Path realPath(Path path) {
        try { return path.toRealPath(); }
        catch (IOException exception) { throw new UncheckedIOException("仓库目录无法读取", exception); }
    }

    /** 由 sessionId 解析其 cwd，仅校验为存在的目录（不校验是否 git 仓库）。 */
    private Path sessionCwd(String id) {
        ClaudeChatSession s = sessions.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "会话不存在"));
        String cwd = s.getCwd();
        if (cwd == null || cwd.isBlank()) {
            throw new IllegalArgumentException("会话无工作目录");
        }
        Path dir;
        try {
            dir = Path.of(cwd).toAbsolutePath().normalize();
        } catch (InvalidPathException e) {
            throw new IllegalArgumentException("会话工作目录非法");
        }
        if (!Files.isDirectory(dir)) {
            throw new IllegalArgumentException("会话工作目录不存在");
        }
        return dir;
    }

    /**
     * 解析要查询的 git 仓库目录：
     * <ul>
     *   <li>指定 repo：校验为 cwd 的安全直接子目录名（无分隔符/../、单段、规范化后仍在 cwd 内）且是仓库。</li>
     *   <li>未指定：cwd 自身是仓库→cwd；否则向上找父仓库；再否则子目录里恰有一个仓库→用它；
     *       多个→提示需选择；无→报错。</li>
     * </ul>
     */
    private Path resolvePrimary(String id, String repo) {
        Path base = sessionCwd(id);
        if (repo == null || repo.isBlank()) {
            if (isRepo(base)) {
                return base;
            }
            // 工作在 git 项目子目录时，沿父目录向上查找
            Path parent = findParentRepo(base);
            if (parent != null) {
                return parent;
            }
            List<Path> subs = subRepos(base);
            if (subs.size() == 1) {
                return subs.get(0);
            }
            if (subs.isEmpty()) {
                throw new IllegalArgumentException("会话目录不是 git 仓库，且未找到父级 git 仓库");
            }
            throw new IllegalArgumentException("会话目录下有多个 git 子仓库，请选择要查看的仓库");
        }
        // 指定子仓库：严格校验为直接子目录名，防路径穿越/越权。
        if (repo.contains("/") || repo.contains("\\") || repo.contains("..") || Path.of(repo).getNameCount() != 1) {
            throw new IllegalArgumentException("非法子仓库名");
        }
        Path target = base.resolve(repo).normalize();
        if (!target.startsWith(base)) {
            throw new IllegalArgumentException("非法子仓库路径");
        }
        if (!Files.isDirectory(target)) {
            throw new IllegalArgumentException("子仓库目录不存在");
        }
        if (!isRepo(target)) {
            throw new IllegalArgumentException("子目录不是 git 仓库");
        }
        return target;
    }

    /**
     * 从 dir 的父目录开始，沿目录树向上查找第一个包含 {@code .git} 的目录。
     * 最多查找 {@link #MAX_PARENT_DEPTH} 层，防止在无 git 环境下走到文件系统根部。
     *
     * @return 找到的 git 仓库根目录；未找到返回 {@code null}
     */
    private Path findParentRepo(Path dir) {
        Path current = dir.getParent();
        int depth = 0;
        while (current != null && depth < MAX_PARENT_DEPTH) {
            if (isRepo(current)) {
                return current;
            }
            current = current.getParent();
            depth++;
        }
        return null;
    }

    private boolean isRepo(Path dir) {
        return Files.exists(dir.resolve(".git"));
    }

    /** cwd 的直接子目录里包含 .git 的仓库（含 Windows junction / symlink 指向的仓库），按名排序。 */
    private List<Path> subRepos(Path base) {
        try (Stream<Path> s = Files.list(base)) {
            return s.filter(Files::isDirectory)
                    .filter(this::isRepo)
                    .sorted(Comparator.comparing(p -> p.getFileName().toString().toLowerCase()))
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException("扫描子目录失败", e);
        }
    }
}
