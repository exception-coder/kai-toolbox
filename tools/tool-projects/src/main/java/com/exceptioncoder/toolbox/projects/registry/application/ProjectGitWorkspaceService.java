package com.exceptioncoder.toolbox.projects.registry.application;

import com.exceptioncoder.toolbox.projects.registry.domain.ProjectGitWorkspace;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.ProjectGitCommand;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.ProjectGitWorkspaceReader;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/** 已登记项目的工作区查询与快照绑定推送；仓库级互斥阻止重复推送。 */
@Service
public class ProjectGitWorkspaceService {
    private final ProjectRegistryService registry;
    private final ProjectGitWorkspaceReader reader;
    private final ProjectGitCommand command;
    private final ConcurrentHashMap<Path, Boolean> pushing = new ConcurrentHashMap<>();

    public ProjectGitWorkspaceService(ProjectRegistryService registry, ProjectGitWorkspaceReader reader,
                                      ProjectGitCommand command) {
        this.registry = registry;
        this.reader = reader;
        this.command = command;
    }

    /** 读取已登记项目的本地 Git 快照。 */
    public ProjectGitWorkspace read(String id) {
        return reader.inspect(root(id)).view();
    }

    /** 仅推送用户看到的提交，快照过期时要求重新读取。 */
    public String push(String id, String token) {
        Path root = root(id);
        if (pushing.putIfAbsent(root, Boolean.TRUE) != null) {
            throw new IllegalStateException("该仓库正在推送，请等待完成后刷新");
        }
        try {
            var snapshot = reader.inspect(root);
            var view = snapshot.view();
            if (token == null || !token.equals(view.token())) {
                throw new IllegalArgumentException("分支、提交或推送目标已变化，请刷新后重新推送");
            }
            if (!view.pushBlockedReason().isEmpty()) {
                throw new IllegalArgumentException(view.pushBlockedReason());
            }
            pushDestinations(root, snapshot);
            return updateTracking(root, snapshot);
        } finally {
            pushing.remove(root);
        }
    }

    private void pushDestinations(Path root, ProjectGitWorkspaceReader.Snapshot snapshot) {
        List<String> succeeded = new ArrayList<>();
        List<String> failed = new ArrayList<>();
        for (int i = 0; i < snapshot.urls().size(); i++) {
            String destination = "目标 " + (i + 1);
            try {
                command.run(root, Duration.ofSeconds(60), "-c", "push.followTags=false", "push",
                        "--porcelain", "--no-force", "--no-follow-tags", "--recurse-submodules=no",
                        "--", snapshot.urls().get(i), snapshot.view().head() + ":" + snapshot.target())
                        .requireSuccess();
                succeeded.add(destination);
            } catch (IllegalStateException exception) {
                failed.add(destination + "：" + exception.getMessage());
                if (Thread.currentThread().isInterrupted()) {
                    break;
                }
            }
        }
        if (!failed.isEmpty()) {
            String completed = succeeded.isEmpty() ? "尚无已确认成功的目标" : "已成功：" + String.join("、", succeeded);
            throw new IllegalStateException("推送未全部完成；" + completed + "。" + String.join("；", failed)
                    + "。请核对各远端后重试，已成功的提交不会重复创建");
        }
    }

    private String updateTracking(Path root, ProjectGitWorkspaceReader.Snapshot snapshot) {
        try {
            command.run(root, Duration.ofSeconds(15), "update-ref", snapshot.upstreamRef(),
                    snapshot.view().head(), snapshot.upstreamHead()).requireSuccess();
            return "推送成功，已发送所选提交";
        } catch (IllegalStateException exception) {
            return "推送成功，但本地跟踪引用未更新；请在本机 Git 中 fetch 后刷新";
        }
    }

    private Path root(String id) {
        String localPath = registry.require(id).metadata().localPath();
        try {
            Path root = Path.of(localPath).toRealPath();
            if (!Files.isDirectory(root) || !Files.exists(root.resolve(".git"))) {
                throw new IllegalArgumentException("该项目不是 Git 工作区根目录，请在项目设置中检查本地路径");
            }
            return root;
        } catch (IOException exception) {
            throw new IllegalArgumentException("项目目录不可访问，请检查本地路径后重试", exception);
        }
    }
}
