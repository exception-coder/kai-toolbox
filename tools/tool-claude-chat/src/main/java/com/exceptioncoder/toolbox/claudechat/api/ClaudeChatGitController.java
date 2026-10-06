package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.GitRepoRefView;
import com.exceptioncoder.toolbox.claudechat.service.SessionGitRepositoryService;
import com.exceptioncoder.toolbox.common.git.CommitDiff;
import com.exceptioncoder.toolbox.common.git.CommitsResponse;
import com.exceptioncoder.toolbox.common.git.GitLogService;
import com.exceptioncoder.toolbox.common.git.GitProperties;
import com.exceptioncoder.toolbox.common.git.GitFileDiffResponse;
import com.exceptioncoder.toolbox.common.git.GitStatusResponse;
import com.exceptioncoder.toolbox.common.git.GitPushOperations;
import com.exceptioncoder.toolbox.common.git.GitPushPreview;
import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/** 会话 Git 查询及快照推送；仓库定位由服务端关联关系统一解析。 */
@RestController
@RequestMapping("/api/claude-chat/sessions/{id}/git")
public class ClaudeChatGitController {

    private final SessionGitRepositoryService repositories;
    private final GitProperties gitProps;
    private final GitLogService git;
    private final GitPushOperations pushes;
    private final ProjectAccess projectAccess;


    public ClaudeChatGitController(SessionGitRepositoryService repositories, GitProperties gitProps, GitLogService git,
                                   GitPushOperations pushes, ProjectAccess projectAccess) {
        this.repositories = repositories;
        this.gitProps = gitProps;
        this.git = git;
        this.pushes = pushes;
        this.projectAccess = projectAccess;
    }

    @GetMapping("/push-preview")
    public GitPushPreview pushPreview(@PathVariable String id, @RequestParam(required = false) String repo) {
        Path directory = repositories.resolve(id, repo);
        projectAccess.requireAllowed(directory);
        return pushes.preview(directory);
    }

    @PostMapping("/push")
    public Map<String, String> push(@PathVariable String id, @RequestParam(required = false) String repo,
                                    @RequestBody PushRequest request) {
        Path directory = repositories.resolve(id, repo);
        projectAccess.requireAllowed(directory);
        return Map.of("message", pushes.push(directory, request.token()));
    }

    /** 用户已经查看的推送快照。 */
    public record PushRequest(/** 快照指纹。 */ String token) { }

    /**
     * 列会话目录下可查看提交的 git 仓库。
     * 优先级：cwd 自身是仓库 → 向上找父仓库（子目录作业场景）→ 扫描直接子目录（父目录聚合场景）。
     */
    @GetMapping("/repos")
    public List<GitRepoRefView> repos(@PathVariable String id) {
        return repositories.list(id);
    }

    @GetMapping("/commits")
    public CommitsResponse commits(@PathVariable String id,
                                   @RequestParam(required = false) String repo,
                                   @RequestParam(required = false) Integer limit) {
        Path dir = repositories.resolve(id, repo);
        int lim = limit != null ? limit : gitProps.getCommitLimitDefault();
        return new CommitsResponse(git.listCommits(dir, lim));
    }

    /**
     * 返回单个文件的 diff（unified patch），供前端侧边对比视图使用。
     * filePath：相对 git 仓库根目录的路径（从 /status 接口返回的 entry.path）。
     * x：暂存区状态字符（M/A/D/R/? 等），用于选择最合适的 diff 命令。
     */
    @GetMapping("/diff")
    public GitFileDiffResponse fileDiff(@PathVariable String id,
                                        @RequestParam String filePath,
                                        @RequestParam(required = false, defaultValue = " ") String x,
                                        @RequestParam(required = false) String repo) {
        Path dir = repositories.resolve(id, repo);
        // 安全校验：相对路径不含路径穿越
        if (filePath.contains("..") || filePath.startsWith("/") || filePath.startsWith("\\")) {
            throw new IllegalArgumentException("非法文件路径");
        }
        return git.gitFileDiff(dir, filePath, x);
    }

    /** 返回工作区待提交/未跟踪文件列表（git status --porcelain）。 */
    @GetMapping("/status")
    public GitStatusResponse status(@PathVariable String id,
                                    @RequestParam(required = false) String repo) {
        Path dir = repositories.resolve(id, repo);
        return git.gitStatus(dir);
    }

    @GetMapping("/commit")
    public CommitDiff commit(@PathVariable String id,
                             @RequestParam(required = false) String repo,
                             @RequestParam String hash) {
        Path dir = repositories.resolve(id, repo);
        return git.commitDiff(dir, hash);
    }

}
