package com.exceptioncoder.toolbox.claudechat.service.governance;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.*;

class ProjectExecutionControlStoreTest {
    @TempDir Path root;

    @Test void togglesRemainAuditedAndDoNotTouchBrokenWriters() throws Exception {
        assertThat(ProjectExecutionControlStore.read(root).enabled()).isTrue();
        assertThat(Files.exists(root.resolve(".forge"))).isFalse();
        Files.createDirectories(root.resolve(".forge/spec-resolution"));
        Path writer = root.resolve(".forge/spec-resolution/execution-writers.json");
        Files.writeString(writer, "broken writer");
        var disabled = ProjectExecutionControlStore.update(root, 0, false, "developer", "恢复编码");
        assertThat(disabled.enabled()).isFalse();
        assertThat(disabled.history()).hasSize(1);
        assertThat(ProjectExecutionControlStore.read(root)).isEqualTo(disabled);
        assertThat(ProjectExecutionControlStore.update(root, 1, false, "developer", "相同状态")).isEqualTo(disabled);
        assertThatThrownBy(() -> ProjectExecutionControlStore.update(root, 0, true, "other", "过期面板"))
                .isInstanceOf(ProjectExecutionControlStore.RevisionConflictException.class);
        var enabled = ProjectExecutionControlStore.update(root, 1, true, "developer", "恢复检查");
        assertThat(enabled.history()).hasSize(2);
        assertThat(Files.readString(writer)).isEqualTo("broken writer");
    }

    @Test void projectsAreIndependentAndMissingBooleanIsRejected() throws Exception {
        Path other = Files.createDirectory(root.resolve("other"));
        ProjectExecutionControlStore.update(root, 0, false, "developer", "恢复编码");
        assertThat(ProjectExecutionControlStore.read(other).enabled()).isTrue();
        Files.writeString(root.resolve(".forge/execution-control.json"), "{\"schemaVersion\":1,\"revision\":1}");
        assertThatThrownBy(() -> ProjectExecutionControlStore.read(root)).isInstanceOf(IllegalStateException.class);
    }
}
