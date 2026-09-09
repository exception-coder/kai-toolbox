package com.exceptioncoder.forge.quality.plugin.java;

import com.exceptioncoder.forge.quality.core.DetectionContext;
import com.exceptioncoder.forge.quality.core.StackCapability;
import com.exceptioncoder.forge.quality.core.StackDetector;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Detects Java ecosystem capabilities from repository files. */
final class JavaStackDetector implements StackDetector {
    @Override
    public String id() {
        return "java-stack-detector";
    }

    @Override
    public List<StackCapability> detect(DetectionContext context) {
        List<StackCapability> capabilities = new ArrayList<>();
        List<Path> poms = context.files().stream().filter(path -> path.getFileName().toString().equals("pom.xml")).toList();
        if (!poms.isEmpty()) {
            capabilities.add(capability("build.maven", "Maven", context, poms));
            String pomText = readCombined(poms).toLowerCase(Locale.ROOT);
            addDependencyCapabilities(capabilities, context, poms, pomText);
        }
        if (context.files().stream().anyMatch(path -> path.toString().endsWith(".java"))) {
            List<Path> javaFiles = context.files().stream().filter(path -> path.toString().endsWith(".java")).limit(5).toList();
            capabilities.add(capability("language.java", "Java", context, javaFiles));
        }
        detectDirectoryCapability(context, capabilities, "db/migration", "migration.flyway", "Flyway");
        detectDirectoryCapability(context, capabilities, "db/changelog", "migration.liquibase", "Liquibase");
        return capabilities;
    }

    private static void addDependencyCapabilities(List<StackCapability> result, DetectionContext context,
                                                  List<Path> poms, String pomText) {
        addWhenPresent(result, context, poms, pomText, "spring-boot", "framework.spring-boot", "Spring Boot");
        addWhenPresent(result, context, poms, pomText, "mybatis-plus", "persistence.mybatis-plus", "MyBatis-Plus");
        addWhenPresent(result, context, poms, pomText, "mybatis", "persistence.mybatis", "MyBatis");
        addWhenPresent(result, context, poms, pomText, "spring-boot-starter-data-jpa", "persistence.jpa", "JPA");
        addWhenPresent(result, context, poms, pomText, "postgresql", "database.postgresql", "PostgreSQL");
        addWhenPresent(result, context, poms, pomText, "mysql", "database.mysql", "MySQL");
        addWhenPresent(result, context, poms, pomText, "ojdbc", "database.oracle", "Oracle");
        addWhenPresent(result, context, poms, pomText, "flyway", "migration.flyway", "Flyway");
        addWhenPresent(result, context, poms, pomText, "liquibase", "migration.liquibase", "Liquibase");
    }

    private static void addWhenPresent(List<StackCapability> result, DetectionContext context, List<Path> poms,
                                       String content, String marker, String id, String name) {
        if (content.contains(marker)) {
            List<Path> matchingPoms = poms.stream().filter(path -> contains(path, marker)).toList();
            result.add(capability(id, name, context, matchingPoms));
        }
    }

    private static boolean contains(Path path, String marker) {
        try {
            return Files.readString(path).toLowerCase(Locale.ROOT).contains(marker);
        } catch (IOException exception) {
            throw new IllegalStateException("Cannot read " + path, exception);
        }
    }

    private static void detectDirectoryCapability(DetectionContext context, List<StackCapability> result,
                                                  String marker, String id, String name) {
        List<Path> evidence = context.files().stream()
                .filter(path -> path.toString().replace('\\', '/').contains(marker)).limit(5).toList();
        if (!evidence.isEmpty()) {
            result.add(capability(id, name, context, evidence));
        }
    }

    private static StackCapability capability(String id, String name, DetectionContext context, List<Path> paths) {
        List<String> evidence = paths.stream().limit(5)
                .map(path -> context.projectRoot().relativize(path).toString().replace('\\', '/')).toList();
        return new StackCapability(id, name, evidence);
    }

    private static String readCombined(List<Path> paths) {
        StringBuilder content = new StringBuilder();
        for (Path path : paths) {
            try {
                content.append(Files.readString(path));
            } catch (IOException exception) {
                throw new IllegalStateException("Cannot read " + path, exception);
            }
        }
        return content.toString();
    }
}
