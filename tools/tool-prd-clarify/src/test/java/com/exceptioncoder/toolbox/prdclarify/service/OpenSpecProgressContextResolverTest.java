package com.exceptioncoder.toolbox.prdclarify.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
        assertThat(context.note()).contains("项目尚无");
    }

    @Test
    void discoversUniquePlanAndResolvesItWithoutManualContext() throws Exception {
        plan("add-export");
        assertThat(resolver.discover(project.toString()).selectedChange()).isEqualTo("add-export");
        assertThat(resolver.resolve(project.toString(), null).authoritative()).isTrue();
    }

    @Test
    void multiplePlansRequireSelectionAndArchiveIsExcluded() throws Exception {
        plan("add-export");
        plan("fix-import");
        plan("archive/old-change");
        Files.createDirectories(project.resolve("openspec/changes/draft-without-tasks"));
        var discovery = resolver.discover(project.toString());
        assertThat(discovery.changeIds()).containsExactly("add-export", "fix-import");
        assertThat(discovery.selectedChange()).isNull();
        assertThatThrownBy(() -> resolver.resolve(project.toString(), null)).hasMessageContaining("多个");
        assertThat(resolver.resolve(project.toString(), "OpenSpec change: fix-import").changeId())
                .isEqualTo("fix-import");
    }

    @Test
    void removedSelectionDoesNotBindAnotherPlan() throws Exception {
        plan("other-plan");
        assertThatThrownBy(() -> resolver.resolve(project.toString(), "OpenSpec change: removed-plan"))
                .hasMessageContaining("不可读");
    }

    @Test
    void invalidPathCannotFallBackToAutomaticSelection() throws Exception {
        plan("add-export");
        assertThatThrownBy(() -> resolver.resolve(project.toString(), "OpenSpec change: ../../outside"))
                .hasMessageContaining("不合法");
    }

    @Test
    void oversizedOrBrokenDirectoryIsErrorRatherThanEmpty() throws Exception {
        plan("large-plan");
        Files.writeString(project.resolve("openspec/changes/large-plan/tasks.md"), "x".repeat(262145));
        assertThat(resolver.discover(project.toString()).state()).isEqualTo("ERROR");
        assertThat(resolver.discover(project.resolve("missing").toString()).state()).isEqualTo("ERROR");
    }

    private void plan(String id) throws Exception {
        Path tasks = project.resolve("openspec/changes").resolve(id).resolve("tasks.md");
        Files.createDirectories(tasks.getParent());
        Files.writeString(tasks, "- [ ] 1.1 verify implementation");
    }
}
