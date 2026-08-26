package com.exceptioncoder.toolbox.claudechat.service;

import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

/** 解析 Forge 团队工具、业务知识与跨项目拓扑的权威本机位置。 */
@Service
public class TeamToolsPathService {

    /** 返回团队工具安装根。 */
    public Path root() {
        return Path.of(System.getProperty("user.home"), ".kai-toolbox", "team-tools")
                .toAbsolutePath().normalize();
    }

    /** 返回 project-domain-knowledge 的知识根。 */
    public Path knowledgeRoot() {
        return root().resolve("project-domain-knowledge").resolve("knowledge");
    }

    /** 返回一个项目的业务知识目录。 */
    public Path knowledgeProject(String projectKey) {
        return knowledgeRoot().resolve(projectKey).normalize();
    }

    /** 返回项目 URL Route Map 的权威位置。 */
    public Path routeMap(String projectKey) {
        return root().resolve("project-coding-profiles").resolve("profiles")
                .resolve(projectKey).resolve("url-route-map.md").normalize();
    }

    /** 返回一个项目的跨项目拓扑目录。 */
    public Path topologyProject(String projectKey) {
        return root().resolve("cross-project-topology").resolve("knowledge")
                .resolve(projectKey).normalize();
    }

    /** 列出已有业务知识的 projectKey。 */
    public List<String> knowledgeProjectKeys() {
        Path rootPath = knowledgeRoot();
        if (!Files.isDirectory(rootPath)) {
            return List.of();
        }
        try (Stream<Path> children = Files.list(rootPath)) {
            return children.filter(Files::isDirectory)
                    .map(path -> path.getFileName().toString())
                    .filter(name -> !name.startsWith("_") && !name.equals("impl"))
                    .sorted(String.CASE_INSENSITIVE_ORDER)
                    .toList();
        } catch (IOException exception) {
            return List.of();
        }
    }
}
