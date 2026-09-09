package com.exceptioncoder.toolbox.prdclarify.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class OpenSpecProgressContextResolverTest {

    @TempDir
    Path project;

    private final OpenSpecProgressContextResolver resolver = new OpenSpecProgressContextResolver();

    @Test
    void readsTasksOnlyForExplicitExistingChange() throws Exception {
        Path tasks = project.resolve("openspec/changes/add-export/tasks.md");
        Files.createDirectories(tasks.getParent());
        Files.writeString(tasks, "- [x] 1.1 export");

        OpenSpecProgressContextResolver.Context context = resolver.resolve(
                project.toString(), "OpenSpec change: add-export");

        assertThat(context.authoritative()).isTrue();
        assertThat(context.changeId()).isEqualTo("add-export");
        assertThat(context.tasks()).contains("1.1 export");
    }

    @Test
    void remainsDegradedWithoutExplicitBinding() {
        OpenSpecProgressContextResolver.Context context = resolver.resolve(project.toString(), "核查导出功能");

        assertThat(context.authoritative()).isFalse();
        assertThat(context.note()).contains("未显式绑定");
    }
}
