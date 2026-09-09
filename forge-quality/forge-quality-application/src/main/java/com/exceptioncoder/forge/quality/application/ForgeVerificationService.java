package com.exceptioncoder.forge.quality.application;

import com.exceptioncoder.forge.quality.core.ChangeSet;
import com.exceptioncoder.forge.quality.core.QualityEngine;
import com.exceptioncoder.forge.quality.core.QualityReport;
import com.exceptioncoder.forge.quality.runtime.RuntimeVerificationEngine;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.stream.Collectors;

/** Engine-neutral application facade used by CLI and agent protocols. */
public final class ForgeVerificationService {
    private final QualityEngine staticEngine;
    private final VerificationOrchestrator orchestrator;

    /** Discovers installed checker and runtime verifier plugins. */
    public ForgeVerificationService() {
        this(QualityEngine.discover(), RuntimeVerificationEngine.discover());
    }

    ForgeVerificationService(QualityEngine staticEngine, RuntimeVerificationEngine runtimeEngine) {
        this.staticEngine = staticEngine;
        this.orchestrator = new VerificationOrchestrator(staticEngine, runtimeEngine);
    }

    /** Detects stack capabilities for a project. */
    public DetectionReport detect(Path project) throws IOException {
        ChangeSet changeSet = changeSet(project);
        return new DetectionReport(staticEngine.pluginIds(), staticEngine.detect(changeSet));
    }

    /** Executes the requested verification phase. */
    public VerificationReport verify(Path project, VerificationPhase phase) throws IOException {
        ChangeSet changeSet = changeSet(project);
        Set<String> capabilities = configuredCapabilities(changeSet.projectRoot());
        return switch (phase) {
            case STATIC -> orchestrator.verifyStatic(changeSet, capabilities);
            case RUNTIME -> orchestrator.verifyRuntime(RuntimeScenarioLoader.load(changeSet.projectRoot()));
            case ALL -> orchestrator.verifyAll(changeSet, capabilities,
                    () -> loadScenariosUnchecked(changeSet.projectRoot()));
        };
    }

    /** Executes only static checks and returns their native report. */
    public QualityReport checkStatic(Path project) throws IOException {
        ChangeSet changeSet = changeSet(project);
        return staticEngine.check(changeSet, configuredCapabilities(changeSet.projectRoot()));
    }

    private static ChangeSet changeSet(Path project) throws IOException {
        Path root = validateProject(project);
        return new ChangeSet(root, ProjectScanner.scan(root));
    }

    private static Path validateProject(Path project) {
        Path normalized = project.toAbsolutePath().normalize();
        if (!Files.isDirectory(normalized)) {
            throw new IllegalArgumentException("Project path is not a directory: " + normalized);
        }
        return normalized;
    }

    private static Set<String> configuredCapabilities(Path projectRoot) throws IOException {
        Path config = projectRoot.resolve(".forge/quality.yml");
        if (!Files.exists(config)) {
            return null;
        }
        Set<String> capabilities = Files.readAllLines(config, StandardCharsets.UTF_8).stream()
                .map(String::trim).filter(line -> line.startsWith("- "))
                .map(line -> line.substring(2).trim()).filter(line -> !line.isBlank())
                .collect(Collectors.toSet());
        if (capabilities.isEmpty()) {
            throw new IllegalArgumentException("Configuration contains no enabled capabilities: " + config);
        }
        return capabilities;
    }

    private static java.util.List<com.exceptioncoder.forge.quality.runtime.RuntimeScenario>
            loadScenariosUnchecked(Path projectRoot) {
        try {
            return RuntimeScenarioLoader.load(projectRoot);
        } catch (IOException exception) {
            throw new IllegalArgumentException("Cannot read runtime configuration: " + exception.getMessage(), exception);
        }
    }
}
