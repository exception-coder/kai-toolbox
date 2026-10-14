package com.exceptioncoder.forge.quality.runtime;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** Fixed Maven test invocation; project configuration cannot supply shell commands. */
record MavenTestPlan(Path root, List<Path> modules, String tests, int timeoutSeconds) {
    static MavenTestPlan from(RuntimeScenario scenario) throws IOException {
        ScenarioConfiguration config = new ScenarioConfiguration(scenario);
        Path root = Path.of(config.requiredText("projectRoot")).toRealPath();
        List<Path> modules = new ArrayList<>();
        for (Object value : config.optionalList("modules")) {
            Path module = root.resolve(String.valueOf(value)).normalize().toRealPath();
            if (!module.startsWith(root) || !Files.isRegularFile(module.resolve("pom.xml"))) {
                throw new IllegalArgumentException("Maven module must belong to the project and contain pom.xml");
            }
            if (!modules.contains(module)) {
                modules.add(module);
            }
        }
        if (modules.isEmpty()) {
            throw new IllegalArgumentException("maven-test requires explicit modules");
        }
        String tests = config.requiredText("tests");
        if (!tests.matches("[A-Za-z0-9_.*!,$#?]+")) {
            throw new IllegalArgumentException("Invalid Maven test selector");
        }
        int timeout = config.optionalInteger("timeoutSeconds", 300);
        if (timeout < 1 || timeout > 1200) {
            throw new IllegalArgumentException("timeoutSeconds must be between 1 and 1200");
        }
        return new MavenTestPlan(root, List.copyOf(modules), tests, timeout);
    }

    List<String> command(String reportSuffix) {
        return command(findMaven(), reportSuffix);
    }

    List<String> command(Path maven, String reportSuffix) {
        boolean windows = System.getProperty("os.name").startsWith("Windows");
        Path java = Path.of(System.getProperty("java.home"), "bin", windows ? "java.exe" : "java");
        return List.of(java.toString(), "-Dmaven.multiModuleProjectDirectory=" + root,
                "-Dmaven.home=" + maven, "-Dclassworlds.conf=" + maven.resolve("bin/m2.conf"),
                "-classpath", maven.resolve("boot") + File.separator + "*",
                "org.codehaus.plexus.classworlds.launcher.Launcher", "--batch-mode", "--no-transfer-progress",
                "-pl", String.join(",", modules.stream().map(p -> p.equals(root)
                        ? "." : root.relativize(p).toString()).toList()),
                "-am", "test", "-Dtest=" + tests, "-Dsurefire.failIfNoSpecifiedTests=false",
                "-Dmaven.build.cache.enabled=false",
                "-Dsurefire.reportNameSuffix=" + reportSuffix);
    }

    private static Path findMaven() {
        List<Path> candidates = new ArrayList<>();
        for (String name : List.of("MAVEN_HOME", "M2_HOME")) {
            String value = System.getenv(name);
            if (value != null && !value.isBlank()) {
                candidates.add(Path.of(value));
            }
        }
        String executablePath = System.getenv("PATH");
        for (String entry : (executablePath == null ? "" : executablePath).split(File.pathSeparator)) {
            if (!entry.isBlank()) {
                Path bin = Path.of(entry);
                if (Files.isRegularFile(bin.resolve("mvn.cmd")) || Files.isRegularFile(bin.resolve("mvn"))) {
                    candidates.add(bin.toAbsolutePath().getParent());
                }
            }
        }
        return candidates.stream().filter(p -> Files.isRegularFile(p.resolve("bin/m2.conf"))
                && Files.isDirectory(p.resolve("boot"))).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Installed Maven not found; set MAVEN_HOME"));
    }
}
