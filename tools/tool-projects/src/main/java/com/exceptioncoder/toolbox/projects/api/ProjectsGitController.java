package com.exceptioncoder.toolbox.projects.api;

import com.exceptioncoder.toolbox.projects.api.dto.CommitDiff;
import com.exceptioncoder.toolbox.projects.api.dto.CommitsResponse;
import com.exceptioncoder.toolbox.projects.config.ProjectsProperties;
import com.exceptioncoder.toolbox.projects.service.GitLogService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;

/**
 * 「项目管理」的 git 只读查询接口：列最近提交 + 取单提交 diff。
 *
 * <ul>
 *   <li>{@code GET /api/projects/git/commits?path=&limit=} — 最近提交列表</li>
 *   <li>{@code GET /api/projects/git/commit?path=&hash=} — 单提交 diff</li>
 * </ul>
 *
 * <p>path 必须落在 {@code toolbox.projects.root} 之内、是目录、且含 {@code .git}，否则 400（防越权）。</p>
 */
@RestController
@RequestMapping("/api/projects/git")
public class ProjectsGitController {

    private final ProjectsProperties props;
    private final GitLogService git;

    public ProjectsGitController(ProjectsProperties props, GitLogService git) {
        this.props = props;
        this.git = git;
    }

    @GetMapping("/commits")
    public CommitsResponse commits(@RequestParam String path, @RequestParam(required = false) Integer limit) {
        Path dir = resolveGitDir(path);
        int lim = limit != null ? limit : props.getCommitLimitDefault();
        return new CommitsResponse(git.listCommits(dir, lim));
    }

    @GetMapping("/commit")
    public CommitDiff commit(@RequestParam String path, @RequestParam String hash) {
        Path dir = resolveGitDir(path);
        return git.commitDiff(dir, hash);
    }

    /** 规整 + 三道校验（根内 / 是目录 / 含 .git）。非法抛 IllegalArgumentException → 400。 */
    private Path resolveGitDir(String rawPath) {
        String rootSetting = props.getRoot();
        if (rootSetting == null || rootSetting.isBlank()) {
            throw new IllegalArgumentException("toolbox.projects.root 未配置");
        }
        Path root = Path.of(rootSetting).toAbsolutePath().normalize();
        Path target;
        try {
            target = Path.of(rawPath).toAbsolutePath().normalize();
        } catch (InvalidPathException e) {
            throw new IllegalArgumentException("path 非法: " + rawPath);
        }
        if (!target.startsWith(root)) {
            throw new IllegalArgumentException("path 不在扫描根目录之内");
        }
        if (!Files.isDirectory(target)) {
            throw new IllegalArgumentException("path 不存在或不是目录");
        }
        if (!Files.exists(target.resolve(".git"))) {
            throw new IllegalArgumentException("非 git 项目（缺少 .git）");
        }
        return target;
    }
}
