package com.exceptioncoder.toolbox.projects.registry.application;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/** 所有项目及会话 Git 写操作共享的规范仓库互斥。 */
@Component
public class ProjectGitMutationLock {
    private final ConcurrentHashMap<Path, Boolean> active = new ConcurrentHashMap<>();

    /** @return 持锁操作结果；同一仓库并发写请求明确拒绝 */
    public <T> T execute(Path repository, Supplier<T> action) {
        Path root = canonicalRoot(repository);
        if (active.putIfAbsent(root, Boolean.TRUE) != null) {
            throw new IllegalStateException("该仓库正在检查、拉取或推送，请等待完成后刷新");
        }
        try {
            return action.get();
        } finally {
            active.remove(root);
        }
    }

    /** @return 可访问的 Git 工作树根目录；兼容 worktree 的 .git 文件 */
    public Path canonicalRoot(Path repository) {
        try {
            Path root = repository.toRealPath();
            if (!Files.isDirectory(root) || !Files.exists(root.resolve(".git"))) {
                throw new IllegalArgumentException("该项目不是 Git 工作区根目录，请检查本地路径");
            }
            return root;
        } catch (IOException exception) {
            throw new IllegalArgumentException("项目目录不可访问，请检查本地路径后重试", exception);
        }
    }
}
