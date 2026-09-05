package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class ForgeQualityGateAdapterTest {

    private final ForgeQualityGateAdapter adapter = new ForgeQualityGateAdapter(new ObjectMapper());

    @TempDir
    Path temporaryDirectory;

    @Test
    void resolvesRepositoryQualityGateForNestedSessionDirectory() throws IOException {
        Path repositoryRoot = createQualityGate(temporaryDirectory.resolve("repository"));
        Path sessionRoot = Files.createDirectories(repositoryRoot.resolve("frontend/src/features/claude-chat"));

        Path result = adapter.resolveVerificationRoot(sessionRoot, repositoryRoot.toString());

        assertThat(result).isEqualTo(repositoryRoot.toAbsolutePath().normalize());
    }

    @Test
    void rejectsRepositoryRootOutsideBoundSessionDirectory() throws IOException {
        Path sessionRoot = Files.createDirectories(temporaryDirectory.resolve("repository/session"));
        Path unrelatedRoot = createQualityGate(temporaryDirectory.resolve("unrelated"));

        Path result = adapter.resolveVerificationRoot(sessionRoot, unrelatedRoot.toString());

        assertThat(result).isNull();
    }

    @Test
    void prefersQualityGateInBoundProjectRoot() throws IOException {
        Path projectRoot = createQualityGate(temporaryDirectory.resolve("project"));

        Path result = adapter.resolveVerificationRoot(projectRoot, "");

        assertThat(result).isEqualTo(projectRoot.toAbsolutePath().normalize());
    }

    private Path createQualityGate(Path root) throws IOException {
        Path scripts = Files.createDirectories(root.resolve("scripts"));
        Files.createFile(scripts.resolve("forge-quality.ps1"));
        return root;
    }
}
