package com.exceptioncoder.toolbox.claudechat.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class OpenSpecChangeCatalogTest {
    @TempDir Path root;

    @Test
    void pagesAndFindsActiveChangesWithoutCli() throws IOException {
        Path changes = Files.createDirectories(root.resolve("openspec/changes"));
        for (String id : new String[]{"implement-iam-access", "implement-iam-authentication", "implement-iam-organization"}) {
            Path change = Files.createDirectory(changes.resolve(id));
            Files.writeString(change.resolve("tasks.md"), "- [x] 1.0 已完成\n- [ ] 1.1 待执行\n");
        }
        Files.createDirectory(changes.resolve("archive"));
        Files.writeString(changes.resolve("implement-iam-access/proposal.md"), "# 权限范围\n管理角色访问控制");
        var catalog = new OpenSpecChangeCatalog();

        var first = catalog.search(root, "implement-iam", 0, 2);
        assertThat(first.items()).hasSize(2).allSatisfy(item -> {
            assertThat(item.completedTasks()).isEqualTo(1);
            assertThat(item.totalTasks()).isEqualTo(2);
        });
        assertThat(first.nextOffset()).isEqualTo(2);
        var second = catalog.search(root, "implement-iam", first.nextOffset(), 2);
        assertThat(second.items()).hasSize(1);
        assertThat(second.nextOffset()).isNull();
        assertThat(catalog.find(root, "implement-iam-access")).isPresent();
        assertThat(catalog.recommend(root, "继续 implement-iam-access", 2).getFirst().id())
                .isEqualTo("implement-iam-access");
        assertThat(catalog.proposalExcerpt(Files.createDirectories(root.resolve("modules/access")),
                "implement-iam-access")).contains("角色访问控制");
    }
}
