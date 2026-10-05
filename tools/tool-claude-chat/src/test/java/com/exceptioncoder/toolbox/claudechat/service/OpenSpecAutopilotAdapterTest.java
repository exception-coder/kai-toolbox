package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import java.util.List;

class OpenSpecAutopilotAdapterTest {

    private final OpenSpecAutopilotAdapter adapter = new OpenSpecAutopilotAdapter(
            mock(OpenSpecCliGateway.class), new ObjectMapper());

    @TempDir
    Path temporaryDirectory;

    @Test
    void selectsDevelopmentTaskPastExplicitManualProductionTask() {
        OpenSpecCliGateway cli = mock(OpenSpecCliGateway.class);
        Path root = temporaryDirectory;
        when(cli.run(root, List.of("status", "--change", "example", "--json")))
                .thenReturn(new OpenSpecCliGateway.CommandResult(true, false, 0, "{}"));
        when(cli.run(root, List.of("instructions", "apply", "--change", "example", "--json")))
                .thenReturn(new OpenSpecCliGateway.CommandResult(true, false, 0,
                        "{\"tasks\":[{\"id\":\"1\",\"description\":\"1.1 [MANUAL_PRODUCTION] Verify target database\",\"done\":false},"
                                + "{\"id\":\"2\",\"description\":\"1.2 Implement locally\",\"done\":false}]}"));

        var snapshot = new OpenSpecAutopilotAdapter(cli, new ObjectMapper()).inspect(root, "example");

        assertThat(snapshot.nextTask().id()).isEqualTo("1.2");
        assertThat(snapshot.pendingManualProductionTasks()).extracting(OpenSpecAutopilotAdapter.TaskSnapshot::id)
                .containsExactly("1.1");
    }

    @Test
    void selectsDevelopmentTaskPastManualConfirmation() {
        OpenSpecCliGateway cli = mock(OpenSpecCliGateway.class);
        Path root = temporaryDirectory;
        when(cli.run(root, List.of("status", "--change", "example", "--json")))
                .thenReturn(new OpenSpecCliGateway.CommandResult(true, false, 0, "{}"));
        when(cli.run(root, List.of("instructions", "apply", "--change", "example", "--json")))
                .thenReturn(new OpenSpecCliGateway.CommandResult(true, false, 0,
                        "{\"tasks\":[{\"id\":\"1.2\",\"description\":\"[MANUAL_CONFIRMATION] Confirm ERP source key\",\"done\":false},"
                                + "{\"id\":\"1.3\",\"description\":\"Implement local reconciliation\",\"done\":false}]}"));

        var snapshot = new OpenSpecAutopilotAdapter(cli, new ObjectMapper()).inspect(root, "example");

        assertThat(snapshot.nextTask().id()).isEqualTo("2");
        assertThat(snapshot.pendingManualHandoffTasks()).extracting(OpenSpecAutopilotAdapter.TaskSnapshot::id)
                .containsExactly("1");
    }

    @Test
    void parsesLargeChangeListWithoutUsingTheSmallDiagnosticLimit() throws IOException {
        String padding = "x".repeat(17_000);
        String json = "{\"changes\":[{\"name\":\"implement-iam-organization\",\"completedTasks\":1,"
                + "\"totalTasks\":11,\"lastModified\":\"" + padding + "\"}]}";
        Path output = temporaryDirectory.resolve("changes.json");
        Files.writeString(output, json);

        assertThat(adapter.parseChanges(output)).extracting(OpenSpecAutopilotAdapter.ChangeOption::id)
                .containsExactly("implement-iam-organization");
    }

    @Test
    void reportsTruncatedListInsteadOfClaimingThereAreNoChanges() throws IOException {
        var cli = new OpenSpecCliGateway();
        Path output = temporaryDirectory.resolve("list.json");
        Files.writeString(output, "x".repeat(20_500));

        assertThat(cli.readOutput(output, 16_000)).endsWith(OpenSpecCliGateway.TRUNCATED_MARKER);
    }

    @Test
    void findsArchivedChangeFromRepositoryRootForNestedSessionDirectory() throws IOException {
        Path repositoryRoot = temporaryDirectory.resolve("repository");
        Path sessionRoot = Files.createDirectories(repositoryRoot.resolve("frontend/src/features/claude-chat"));
        Files.createDirectories(repositoryRoot.resolve(
                "openspec/changes/archive/2026-09-03-openspec-task-board"));

        boolean archived = adapter.isArchived(sessionRoot, repositoryRoot.toString(), "openspec-task-board");

        assertThat(archived).isTrue();
    }

    @Test
    void rejectsArchiveRootOutsideBoundRepository() throws IOException {
        Path sessionRoot = Files.createDirectories(temporaryDirectory.resolve("repository/session"));
        Path unrelatedRoot = temporaryDirectory.resolve("unrelated");
        Files.createDirectories(unrelatedRoot.resolve(
                "openspec/changes/archive/2026-09-03-openspec-task-board"));

        boolean archived = adapter.isArchived(sessionRoot, unrelatedRoot.toString(), "openspec-task-board");

        assertThat(archived).isFalse();
    }

    @Test
    void prefersArchiveRootInBoundProjectDirectory() throws IOException {
        Path projectRoot = temporaryDirectory.resolve("project");
        Files.createDirectories(projectRoot.resolve("openspec/changes/archive/openspec-task-board"));

        boolean archived = adapter.isArchived(projectRoot, "", "openspec-task-board");

        assertThat(archived).isTrue();
    }
}
