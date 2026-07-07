package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.GitRepoRefView;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.common.git.CommitDiff;
import com.exceptioncoder.toolbox.common.git.CommitsResponse;
import com.exceptioncoder.toolbox.common.git.GitLogService;
import com.exceptioncoder.toolbox.common.git.GitProperties;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

/**
 * 会话工作目录的 git 只读查询：列最近提交 + 取单提交 diff，复用 common {@link GitLogService}。
 *
 * <p>路径不收客户端任意入参，只认 sessionId（服务端从会话记录取 cwd）+ 可选 repo（限定为 cwd 的直接子目录名，
 * 严格校验防越权）。适配「父目录当工作目录、子目录才是 git 仓库」的场景（taskspace 聚合、含多个项目的父目录）：
 * cwd 自身是仓库则用 cwd；否则扫描其直接子目录里的 git 仓库，由 /repos 暴露、由 repo 参数选定。</p>
 */
@RestController
@RequestMapping("/api/claude-chat/sessions/{id}/git")
public class ClaudeChatGitController {

    private final ClaudeChatSessionRepository repo;
    private final GitProperties gitProps;
    private final GitLogService git;

    public ClaudeChatGitController(ClaudeChatSessionRepository repo, GitProperties gitProps, GitLogService git) {
        this.repo = repo;
        this.gitProps = gitProps;
        this.git = git;
    }

    /** 列会话目录下可查看提交的 git 仓库：cwd 自身是仓库→只返回它；否则返回其直接子目录里的仓库。空=无仓库。 */
    @GetMapping("/repos")
    public List<GitRepoRefView> repos(@PathVariable String id) {
        Path base = sessionCwd(id);
        List<GitRepoRefView> out = new ArrayList<>();
        if (isRepo(base)) {
            out.add(new GitRepoRefView("", base.getFileName().toString(), true));
            return out;
        }
        for (Path p : subRepos(base)) {
            out.add(new GitRepoRefView(p.getFileName().toString(), p.getFileName().toString(), false));
        }
        return out;
    }

    @GetMapping("/commits")
    public CommitsResponse commits(@PathVariable String id,
                                   @RequestParam(required = false) String repo,
                                   @RequestParam(required = false) Integer limit) {
        Path dir = resolveSessionGitDir(id, repo);
        int lim = limit != null ? limit : gitProps.getCommitLimitDefault();
        return new CommitsResponse(git.listCommits(dir, lim));
    }

    @GetMapping("/commit")
    public CommitDiff commit(@PathVariable String id,
                             @RequestParam(required = false) String repo,
                             @RequestParam String hash) {
        Path dir = resolveSessionGitDir(id, repo);
        return git.commitDiff(dir, hash);
    }

    /** 由 sessionId 解析其 cwd，仅校验为存在的目录（不校验是否 git 仓库）。 */
    private Path sessionCwd(String id) {
        ClaudeChatSession s = repo.findById(id)
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
     *   <li>未指定：cwd 自身是仓库→cwd；否则子目录里恰有一个仓库→用它；多个→提示需选择；无→非仓库。</li>
     * </ul>
     */
    private Path resolveSessionGitDir(String id, String repo) {
        Path base = sessionCwd(id);
        if (repo == null || repo.isBlank()) {
            if (isRepo(base)) {
                return base;
            }
            List<Path> subs = subRepos(base);
            if (subs.size() == 1) {
                return subs.get(0);
            }
            if (subs.isEmpty()) {
                throw new IllegalArgumentException("会话目录不是 git 仓库");
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
