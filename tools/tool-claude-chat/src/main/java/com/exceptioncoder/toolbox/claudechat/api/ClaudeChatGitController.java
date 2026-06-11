package com.exceptioncoder.toolbox.claudechat.api;

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

import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;

/**
 * 会话工作目录的 git 只读查询：列最近提交 + 取单提交 diff，复用 common {@link GitLogService}。
 *
 * <p>路径不收客户端入参，只认 sessionId：服务端从会话记录取 cwd（会话本就在该目录跑 agent），
 * 天然防越权。cwd 非 git 仓库/已失效 → 400；会话不存在 → 404。</p>
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

    @GetMapping("/commits")
    public CommitsResponse commits(@PathVariable String id, @RequestParam(required = false) Integer limit) {
        Path dir = resolveSessionGitDir(id);
        int lim = limit != null ? limit : gitProps.getCommitLimitDefault();
        return new CommitsResponse(git.listCommits(dir, lim));
    }

    @GetMapping("/commit")
    public CommitDiff commit(@PathVariable String id, @RequestParam String hash) {
        Path dir = resolveSessionGitDir(id);
        return git.commitDiff(dir, hash);
    }

    /** 由 sessionId 解析其 cwd，并校验是 git 仓库目录。 */
    private Path resolveSessionGitDir(String id) {
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
        if (!Files.exists(dir.resolve(".git"))) {
            throw new IllegalArgumentException("会话目录不是 git 仓库");
        }
        return dir;
    }
}
