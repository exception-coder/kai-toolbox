package com.exceptioncoder.toolbox.projects.registry.infrastructure;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;

import static org.assertj.core.api.Assertions.*;

/** 使用真实文件系统验证图谱候选发布的保留与回滚边界。 */
class GraphifyPublicationTest {
    @TempDir Path root;

    @Test
    void publishesReceiptAfterGraphAndManifest() throws Exception {
        Path live = baseline();
        Path stage = candidate();
        new GraphifyPublication(live).publish(stage, "fingerprint", false);
        assertThat(Files.readString(live.resolve("graph.json"))).isEqualTo("new graph");
        assertThat(Files.readString(live.resolve("manifest.json"))).isEqualTo("new manifest");
        assertThat(Files.readString(live.resolve(".forge-source-fingerprint")))
                .isEqualTo("fingerprint:" + Files.getLastModifiedTime(live.resolve("graph.json")).toMillis());
    }

    @Test
    void rejectsExternalMutationWithoutOverwritingIt() throws Exception {
        Path live = baseline();
        var publication = new GraphifyPublication(live);
        Files.writeString(live.resolve("graph.json"), "external graph");
        assertThatThrownBy(() -> publication.publish(candidate(), "new", false)).hasMessageContaining("其他进程");
        assertThat(Files.readString(live.resolve("graph.json"))).isEqualTo("external graph");
        assertThat(Files.readString(live.resolve("manifest.json"))).isEqualTo("old manifest");
    }

    @Test
    void rollsBackGraphAndTimestampWhenManifestCannotBePublished() throws Exception {
        Path live = baseline();
        FileTime originalTime = Files.getLastModifiedTime(live.resolve("graph.json"));
        Path stage = candidate();
        Files.delete(stage.resolve("manifest.json"));
        assertThatThrownBy(() -> new GraphifyPublication(live).publish(stage, "new", false)).isInstanceOf(java.io.IOException.class);
        assertThat(Files.readString(live.resolve("graph.json"))).isEqualTo("old graph");
        assertThat(Files.getLastModifiedTime(live.resolve("graph.json"))).isEqualTo(originalTime);
        assertThat(Files.readString(live.resolve(".forge-source-fingerprint"))).isEqualTo("old receipt");
    }

    @Test
    void noChangeLeavesGraphBytesAndTimestampUntouched() throws Exception {
        Path live = baseline();
        FileTime originalTime = Files.getLastModifiedTime(live.resolve("graph.json"));
        new GraphifyPublication(live).publish(candidate(), "current", true);
        assertThat(Files.readString(live.resolve("graph.json"))).isEqualTo("old graph");
        assertThat(Files.getLastModifiedTime(live.resolve("graph.json"))).isEqualTo(originalTime);
    }

    private Path baseline() throws Exception {
        Path live = Files.createDirectory(root.resolve("graphify-out"));
        Files.writeString(live.resolve("graph.json"), "old graph");
        Files.setLastModifiedTime(live.resolve("graph.json"), FileTime.fromMillis(1700000000000L));
        Files.writeString(live.resolve("manifest.json"), "old manifest");
        Files.writeString(live.resolve(".forge-source-fingerprint"), "old receipt");
        return live;
    }

    private Path candidate() throws Exception {
        Path stage = Files.createDirectory(root.resolve("stage"));
        Files.writeString(stage.resolve("graph.json"), "new graph");
        Files.writeString(stage.resolve("manifest.json"), "new manifest");
        Files.writeString(stage.resolve(".graphify_build.json"), "{}");
        return stage;
    }
}
