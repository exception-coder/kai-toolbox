package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.BusinessOpenSpecStatusView;
import com.exceptioncoder.toolbox.claudechat.config.BusinessWorkspaceProperties;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class BusinessOpenSpecServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void detectsConfigAndCurrentClaudeCodexSkillLocations() throws IOException {
        Path repository = tempDir.resolve("repository");
        Files.createDirectories(repository.resolve(".git"));
        Files.createDirectories(repository.resolve("openspec"));
        Files.writeString(repository.resolve("openspec").resolve("config.yaml"), "schema: spec-driven");
        createSkill(repository.resolve(".claude").resolve("skills"), "openspec-propose");
        createSkill(repository.resolve(".agents").resolve("skills"), "openspec-apply-change");

        BusinessOpenSpecStatusView status = service().inspect(repository);

        assertThat(status.status()).isEqualTo("READY");
        assertThat(status.initialized()).isTrue();
        assertThat(status.claudeConfigured()).isTrue();
        assertThat(status.codexConfigured()).isTrue();
    }

    @Test
    void reportsMissingCodexSkillWithoutAcceptingLegacyDirectory() throws IOException {
        Path repository = tempDir.resolve("repository");
        Files.createDirectories(repository.resolve(".git"));
        Files.createDirectories(repository.resolve("openspec"));
        Files.writeString(repository.resolve("openspec").resolve("config.yaml"), "schema: spec-driven");
        createSkill(repository.resolve(".claude").resolve("skills"), "openspec-propose");
        createSkill(repository.resolve(".codex").resolve("skills"), "openspec-propose");

        BusinessOpenSpecStatusView status = service().inspect(repository);

        assertThat(status.status()).isEqualTo("PARTIAL");
        assertThat(status.codexConfigured()).isFalse();
        assertThat(status.message()).isEqualTo("缺少Codex Skill");
    }

    @Test
    void keepsInitializationCommandFixedAndNonDestructive() {
        assertThat(BusinessOpenSpecService.initializationCommand())
                .containsExactly("openspec", "init", ".", "--tools", "claude,codex", "--no-animation")
                .doesNotContain("--force");
    }

    private BusinessOpenSpecService service() {
        return new BusinessOpenSpecService(
                mock(BusinessWorkspaceProperties.class),
                mock(BusinessWorkspaceCatalog.class),
                mock(ForgeEnvironmentCommandRunner.class),
                mock(SseEmitterRegistry.class));
    }

    private void createSkill(Path root, String name) throws IOException {
        Path skill = root.resolve(name);
        Files.createDirectories(skill);
        Files.writeString(skill.resolve("SKILL.md"), "# skill");
    }
}
