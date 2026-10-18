package com.exceptioncoder.toolbox;

import com.exceptioncoder.toolbox.claudechat.api.ClaudeChatGitController;
import com.exceptioncoder.toolbox.claudechat.service.SessionGitRepositoryService;
import com.exceptioncoder.toolbox.common.git.GitLogService;
import com.exceptioncoder.toolbox.common.git.GitProperties;
import com.exceptioncoder.toolbox.common.git.GitPullOperations;
import com.exceptioncoder.toolbox.common.git.GitPushOperations;
import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import com.exceptioncoder.toolbox.projects.registry.application.ProjectGitMutationLock;
import com.exceptioncoder.toolbox.projects.registry.application.ProjectGitPullService;
import com.exceptioncoder.toolbox.projects.registry.application.ProjectGitWorkspaceService;
import com.exceptioncoder.toolbox.projects.registry.application.ProjectRegistryService;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.ProjectGitCommand;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.ProjectGitPullReader;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.ProjectGitWorkspaceReader;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/** 宿主实际依赖类路径下验证公共 Git 端口和会话适配器可装配。 */
class GitOperationsAssemblyTest {
    @Test
    void assemblesSessionPullAndPushUsingTheSameMutationBoundary() {
        new ApplicationContextRunner()
                .withBean(GitProperties.class, GitProperties::new)
                .withBean(ProjectAccess.class, () -> path -> true)
                .withBean(ProjectRegistryService.class, () -> mock(ProjectRegistryService.class))
                .withBean(SessionGitRepositoryService.class, () -> mock(SessionGitRepositoryService.class))
                .withBean(GitLogService.class, () -> mock(GitLogService.class))
                .withUserConfiguration(ProjectGitCommand.class, ProjectGitPullReader.class,
                        ProjectGitWorkspaceReader.class, ProjectGitMutationLock.class,
                        ProjectGitPullService.class, ProjectGitWorkspaceService.class, ClaudeChatGitController.class)
                .run(context -> assertThat(context).hasNotFailed().hasSingleBean(GitPullOperations.class)
                        .hasSingleBean(GitPushOperations.class).hasSingleBean(ProjectGitMutationLock.class)
                        .hasSingleBean(ClaudeChatGitController.class));
    }
}
