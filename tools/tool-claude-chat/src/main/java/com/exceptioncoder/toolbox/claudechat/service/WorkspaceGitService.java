package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.WorkspaceProperties;
import com.exceptioncoder.toolbox.common.git.GitFileDiffResponse;
import com.exceptioncoder.toolbox.common.git.GitLogService;
import com.exceptioncoder.toolbox.common.git.GitStatusResponse;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;

/**
 * Read-only Git queries for projects under the configured workspace roots.
 */
@Service
public class WorkspaceGitService {

    private final WorkspaceProperties properties;
    private final GitLogService gitLogService;

    public WorkspaceGitService(WorkspaceProperties properties, GitLogService gitLogService) {
        this.properties = properties;
        this.gitLogService = gitLogService;
    }

    /**
     * Lists staged, unstaged and untracked files in a workspace project.
     *
     * @param projectPath absolute workspace project path
     * @return current Git working-tree status
     */
    public GitStatusResponse status(String projectPath) {
        return gitLogService.gitStatus(resolveRepository(projectPath));
    }

    /**
     * Returns the unified diff for one changed workspace project file.
     *
     * @param projectPath absolute workspace project path
     * @param filePath file path relative to the repository root
     * @param indexStatus porcelain index status
     * @return unified diff and truncation state
     */
    public GitFileDiffResponse fileDiff(String projectPath, String filePath, String indexStatus) {
        return gitLogService.gitFileDiff(resolveRepository(projectPath), filePath, indexStatus);
    }

    private Path resolveRepository(String rawPath) {
        Path target;
        try {
            target = Path.of(rawPath).toAbsolutePath().normalize();
        } catch (InvalidPathException | NullPointerException exception) {
            throw new IllegalArgumentException("path 非法");
        }
        boolean withinWorkspace = properties.getRoots().stream()
                .filter(root -> root != null && !root.isBlank())
                .map(root -> Path.of(root).toAbsolutePath().normalize())
                .anyMatch(target::startsWith);
        if (!withinWorkspace) {
            throw new IllegalArgumentException("path 不在工作区根目录之内");
        }
        if (!Files.isDirectory(target)) {
            throw new IllegalArgumentException("path 不存在或不是目录");
        }
        if (!Files.exists(target.resolve(".git"))) {
            throw new IllegalArgumentException("非 Git 项目（缺少 .git）");
        }
        return target;
    }
}
