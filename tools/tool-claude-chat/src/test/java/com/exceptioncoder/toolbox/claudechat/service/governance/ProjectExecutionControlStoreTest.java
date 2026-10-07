package com.exceptioncoder.toolbox.claudechat.service.governance;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.*;

class ProjectExecutionControlStoreTest {
    @TempDir Path root;

    @Test void codingFirstIsSharedAuditedAndDoesNotDisableWritingGates() {
        var saved = ProjectExecutionControlStore.update(root, 0, true, "developer", "先完成编码",
                VerificationCadence.CODING_FIRST);
        assertThat(saved.enabled()).isTrue();
        assertThat(ProjectExecutionControlStore.codingFirst(root)).isTrue();
        assertThat(ProjectExecutionControlStore.read(root).history().getFirst().verificationCadence())
                .isEqualTo(VerificationCadence.CODING_FIRST);
        assertThat(ProjectExecutionControlStore.codingInstructions(root)).contains("不自动执行编译", "[IMPLEMENTED]");
        ProjectExecutionControlStore.update(root, 1, true, "developer", "开始集中验收", VerificationCadence.CHECKPOINT);
        assertThat(ProjectExecutionControlStore.codingFirst(root)).isFalse();
    }

    @Test void cadenceIsAuditedWithoutChangingGatesAndLegacyUpdatesPreserveIt() throws Exception {
        assertThat(ProjectExecutionControlStore.read(root).verificationCadence()).isEqualTo(VerificationCadence.CHECKPOINT);
        var changed = ProjectExecutionControlStore.update(root, 0, true, "developer", "逐任务验证", VerificationCadence.PER_TASK);
        assertThat(changed.enabled()).isTrue();
        assertThat(changed.revision()).isEqualTo(1);
        assertThat(changed.history().getFirst().verificationCadence()).isEqualTo(VerificationCadence.PER_TASK);
        assertThat(ProjectExecutionControlStore.read(root)).isEqualTo(changed);
        assertThat(ProjectExecutionControlStore.update(root, 1, true, "developer", "相同配置", VerificationCadence.PER_TASK)).isEqualTo(changed);
        assertThatThrownBy(() -> ProjectExecutionControlStore.update(root, 0, true, "other", "过期", VerificationCadence.CHECKPOINT))
                .isInstanceOf(ProjectExecutionControlStore.RevisionConflictException.class);
        assertThat(ProjectExecutionControlStore.update(root, 1, false, "developer", "关闭门禁").verificationCadence())
                .isEqualTo(VerificationCadence.PER_TASK);
        var json = new com.fasterxml.jackson.databind.ObjectMapper();
        Path file = root.resolve(".forge/execution-control.json");
        var legacy = (com.fasterxml.jackson.databind.node.ObjectNode) json.readTree(file.toFile());
        legacy.remove("verificationCadence");
        Files.writeString(file, json.writeValueAsString(legacy));
        var restored = ProjectExecutionControlStore.read(root);
        assertThat(restored.verificationCadence()).isEqualTo(VerificationCadence.CHECKPOINT);
        assertThat(restored.enabled()).isFalse();
        assertThat(restored.history()).hasSize(2);
    }

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
