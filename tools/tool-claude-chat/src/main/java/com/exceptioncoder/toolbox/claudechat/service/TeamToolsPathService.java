package com.exceptioncoder.toolbox.claudechat.service;

import org.springframework.stereotype.Service;

import java.nio.file.Path;

/** 解析 Forge 团队工具、业务知识与跨项目拓扑的权威本机位置。 */
@Service
public class TeamToolsPathService {

    /** 返回团队工具安装根。 */
    public Path root() {
        return Path.of(System.getProperty("user.home"), ".kai-toolbox", "team-tools")
                .toAbsolutePath().normalize();
    }

    /** 项目知识只从已解析的源码目录读取，调用者负责项目授权。 */
    public Path knowledgeProject(String sourcePath) {
        return Path.of(sourcePath).toAbsolutePath().normalize().resolve("docs/domain");
    }

    /** 返回项目 URL Route Map 的权威位置。 */
    public Path routeMap(String projectKey) {
        return root().resolve("project-coding-profiles").resolve("profiles")
                .resolve(projectKey).resolve("url-route-map.md").normalize();
    }


}
