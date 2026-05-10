package com.exceptioncoder.toolbox.projects.service;

import com.exceptioncoder.toolbox.projects.api.dto.ProjectType;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/**
 * 按目录签名识别项目类型。优先级首命中，多签名共存时取更具体的（如 Flutter 项目同时是 git，标记为 flutter）。
 */
public final class ProjectTypeDetector {

    /**
     * 优先级有序的签名规则：从前往后第一个命中的类型即为结果。
     * 用 {@link List} 而非 {@link Map} 是为了保留顺序。
     */
    private static final List<Rule> RULES = List.of(
            new Rule(ProjectType.flutter, List.of("pubspec.yaml")),
            new Rule(ProjectType.maven,   List.of("pom.xml")),
            new Rule(ProjectType.gradle,  List.of("build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts")),
            new Rule(ProjectType.node,    List.of("package.json")),
            new Rule(ProjectType.python,  List.of("pyproject.toml", "requirements.txt"))
    );

    private ProjectTypeDetector() {
    }

    /**
     * 判定目录类型。
     *
     * @param dir 项目目录
     * @return 命中的类型；都未命中时若含 {@code .git} 返回 {@link ProjectType#git}，否则 {@link ProjectType#other}
     */
    public static ProjectType detect(Path dir) {
        for (Rule rule : RULES) {
            for (String marker : rule.markers()) {
                if (Files.exists(dir.resolve(marker))) {
                    return rule.type();
                }
            }
        }
        if (Files.isDirectory(dir.resolve(".git"))) {
            return ProjectType.git;
        }
        return ProjectType.other;
    }

    private record Rule(ProjectType type, List<String> markers) {
    }
}
