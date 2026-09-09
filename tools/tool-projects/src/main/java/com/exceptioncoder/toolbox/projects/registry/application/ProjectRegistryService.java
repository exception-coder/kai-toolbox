package com.exceptioncoder.toolbox.projects.registry.application;

import com.exceptioncoder.toolbox.projects.registry.domain.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.util.List;
import java.util.UUID;

/** 注册与配置系统身份；查询详情时核对画像的新鲜度。 */
@Service
public class ProjectRegistryService {
    private final ProjectRegistryStore store;
    private final ProjectEvidencePort evidence;

    public ProjectRegistryService(ProjectRegistryStore store, ProjectEvidencePort evidence) {
        this.store = store;
        this.evidence = evidence;
    }

    public List<RegistryProject> list() {
        return store.projects();
    }

    public RegistryProject require(String id) {
        return store.project(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "项目未登记"));
    }

    public RegistryProject register(RegistryProject.Metadata metadata) {
        long now = System.currentTimeMillis();
        RegistryProject project = new RegistryProject(UUID.randomUUID().toString(), validate(metadata),
                "UNINITIALIZED", 0, now, now);
        try {
            store.insert(project);
        } catch (DuplicateKeyException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "该本地目录已登记，请打开已有项目");
        }
        return project;
    }

    public RegistryProject update(String id, RegistryProject.Metadata metadata) {
        RegistryProject current = require(id);
        RegistryProject updated = new RegistryProject(id, validate(metadata),
                current.profileVersion() == 0 ? "UNINITIALIZED" : "SYNC_REQUIRED", current.profileVersion(),
                current.createdAt(), System.currentTimeMillis());
        try {
            store.update(updated);
        } catch (DuplicateKeyException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "该本地目录已被其他系统登记");
        } catch (IllegalStateException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, exception.getMessage(), exception);
        }
        return updated;
    }

    public Detail detail(String id) {
        RegistryProject project = require(id);
        SystemProfile profile = store.profile(id, project.profileVersion()).orElse(null);
        String state = project.state();
        if (profile != null && !List.of("INITIALIZING", "FAILED", "SYNC_REQUIRED").contains(state)) {
            try {
                if (!profile.fingerprint().equals(evidence.scan(project.metadata().localPath()).fingerprint())) {
                    state = "SYNC_REQUIRED";
                    store.markSyncRequired(id, project.profileVersion());
                }
            } catch (IllegalArgumentException | IllegalStateException exception) {
                state = "DEGRADED";
            }
        }
        RegistryProject view = new RegistryProject(project.id(), project.metadata(), state, project.profileVersion(),
                project.createdAt(), project.updatedAt());
        return new Detail(view, profile, store.runs(id), store.tasks(id));
    }

    private RegistryProject.Metadata validate(RegistryProject.Metadata input) {
        if (input == null || input.name() == null || input.name().isBlank() || input.name().length() > 120) {
            throw new IllegalArgumentException("请输入 1–120 字的项目名称");
        }
        String type = input.repoType() == null ? "local" : input.repoType();
        if (!List.of("git", "svn", "local").contains(type)) {
            throw new IllegalArgumentException("仓库类型必须为 git、svn 或 local");
        }
        validateUrl(input.devUrl());
        validateUrl(input.testUrl());
        validateRepoUrl(input.repoUrl());
        return new RegistryProject.Metadata(input.name().trim(), evidence.canonicalPath(input.localPath()), type,
                value(input.repoUrl()), value(input.defaultBranch()), value(input.devUrl()), value(input.testUrl()),
                value(input.owner()));
    }

    private String value(String value) {
        if (value != null && value.length() > 2000) {
            throw new IllegalArgumentException("字段内容过长");
        }
        return value == null ? "" : value.trim();
    }

    private void validateUrl(String url) {
        if (url == null || url.isBlank()) { return; }
        URI uri = URI.create(url);
        if (!List.of("http", "https").contains(uri.getScheme()) || uri.getHost() == null
                || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null) {
            throw new IllegalArgumentException("运行地址须为不含凭据、查询参数的 HTTP(S) 地址");
        }
    }

    private void validateRepoUrl(String url) {
        if (url == null || url.isBlank()) { return; }
        if (url.startsWith("git@") && url.matches("git@[^: /]+:[^\\s?]+")) { return; }
        validateUrl(url);
    }

    /** 项目详情查询结果，各区域共享同一系统身份。 */
    public record Detail(
            /** 注册信息。 */ RegistryProject project,
            /** 最新画像，可空。 */ SystemProfile profile,
            /** 最近运行。 */ List<SystemInitRun> runs,
            /** 需求池绑定。 */ List<SystemTaskBinding> tasks
    ) { }
}
