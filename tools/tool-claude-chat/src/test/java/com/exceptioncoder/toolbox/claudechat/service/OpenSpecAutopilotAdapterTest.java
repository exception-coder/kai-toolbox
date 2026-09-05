package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class OpenSpecAutopilotAdapterTest {

    private final OpenSpecAutopilotAdapter adapter = new OpenSpecAutopilotAdapter(
            mock(OpenSpecCliGateway.class), new ObjectMapper());

    @TempDir
    Path temporaryDirectory;

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
