package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import com.exceptioncoder.toolbox.common.resource.ProjectSystemDirectory;
import com.exceptioncoder.toolbox.projects.registry.domain.ProjectRegistryStore;
import org.springframework.stereotype.Component;
import java.util.List;

/** 对外提供已登记系统身份，不触发扫描或初始化。 */
@Component
public class RegistrySystemDirectory implements ProjectSystemDirectory {
    private final ProjectRegistryStore store;

    public RegistrySystemDirectory(ProjectRegistryStore store) { this.store = store; }

    @Override
    public List<SystemIdentity> systems() {
        return store.projects().stream().map(project -> new SystemIdentity(
                project.id(), project.metadata().name(), project.metadata().localPath())).toList();
    }
}
