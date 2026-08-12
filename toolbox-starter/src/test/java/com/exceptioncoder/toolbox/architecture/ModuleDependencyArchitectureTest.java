package com.exceptioncoder.toolbox.architecture;

import org.junit.jupiter.api.Test;
import org.springframework.util.CollectionUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Guards the modular-monolith boundary between independently owned tool modules.
 */
class ModuleDependencyArchitectureTest {

    /** Maven dependency block matcher. */
    private static final Pattern DEPENDENCY_BLOCK = Pattern.compile(
            "<dependency>(.*?)</dependency>", Pattern.DOTALL);
    /** Tool artifact matcher scoped to a dependency block. */
    private static final Pattern ARTIFACT_ID = Pattern.compile(
            "<artifactId>\\s*(tool-[^<\\s]+)\\s*</artifactId>");
    /** Existing direct tool dependencies, retained only as a shrinkable migration baseline. */
    private static final Set<String> LEGACY_TOOL_DEPENDENCIES = Set.of(
            "tool-docker -> tool-hosts",
            "tool-frp -> tool-hosts",
            "tool-resume -> tool-claude-chat",
            "tool-treesize -> tool-hosts"
    );

    /**
     * Rejects new tool-to-tool dependencies and stale exceptions after debt is removed.
     *
     * @throws IOException when project dependency declarations cannot be read
     */
    @Test
    void toolModulesOnlyUseDeclaredLegacyDependencies() throws IOException {
        Path toolsDirectory = findProjectRoot().resolve("tools");
        Set<String> actualDependencies = readToolDependencies(toolsDirectory);

        Set<String> unexpectedDependencies = new TreeSet<>(actualDependencies);
        unexpectedDependencies.removeAll(LEGACY_TOOL_DEPENDENCIES);

        Set<String> staleAllowances = new TreeSet<>(LEGACY_TOOL_DEPENDENCIES);
        staleAllowances.removeAll(actualDependencies);

        assertTrue(
                CollectionUtils.isEmpty(unexpectedDependencies) && CollectionUtils.isEmpty(staleAllowances),
                () -> "Tool module boundary changed. New dependencies=" + unexpectedDependencies
                        + ", stale legacy allowances=" + staleAllowances
                        + ". Extract a platform capability, stable contract, or SPI instead of widening the list."
        );
    }

    /**
     * Locates the reactor root from either the repository or toolbox-starter working directory.
     *
     * @return normalized project root
     */
    private Path findProjectRoot() {
        Path current = Path.of("").toAbsolutePath().normalize();
        while (current != null) {
            if (Files.isRegularFile(current.resolve("pom.xml"))
                    && Files.isDirectory(current.resolve("tools"))) {
                return current;
            }
            current = current.getParent();
        }
        throw new IllegalStateException("Cannot locate kai-toolbox reactor root from "
                + Path.of("").toAbsolutePath());
    }

    /**
     * Reads every tool POM and returns direct dependencies on another tool module.
     *
     * @param toolsDirectory tools module directory
     * @return dependency edges in {@code source -> target} form
     * @throws IOException when a directory or POM cannot be read
     */
    private Set<String> readToolDependencies(Path toolsDirectory) throws IOException {
        Set<String> dependencies = new LinkedHashSet<>();
        try (Stream<Path> toolModules = Files.list(toolsDirectory)) {
            for (Path module : toolModules.filter(Files::isDirectory).sorted().toList()) {
                Path pom = module.resolve("pom.xml");
                if (!Files.isRegularFile(pom)) {
                    continue;
                }
                dependencies.addAll(readToolDependencies(module.getFileName().toString(), pom));
            }
        }
        return dependencies;
    }

    /**
     * Extracts tool artifact IDs only from dependency blocks, excluding the module's own artifact ID.
     *
     * @param sourceModule source tool module name
     * @param pom module POM path
     * @return direct tool dependency edges
     * @throws IOException when the POM cannot be read
     */
    private Set<String> readToolDependencies(String sourceModule, Path pom) throws IOException {
        String pomXml = Files.readString(pom, StandardCharsets.UTF_8);
        Set<String> dependencies = new LinkedHashSet<>();
        Matcher dependencyMatcher = DEPENDENCY_BLOCK.matcher(pomXml);
        while (dependencyMatcher.find()) {
            Matcher artifactMatcher = ARTIFACT_ID.matcher(dependencyMatcher.group(1));
            if (artifactMatcher.find()) {
                dependencies.add(sourceModule + " -> " + artifactMatcher.group(1));
            }
        }
        return dependencies;
    }
}
