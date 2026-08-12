package com.exceptioncoder.toolbox.claudechat.service;

import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.List;

/** ERP、ERP 小程序、SRM、SCM 的固定业务源码目录。 */
@Component
public class BusinessWorkspaceCatalog {

    private static final String GITEE_ROOT = "https://gitee.com/wyoooni/";

    private final List<SystemDefinition> systems = List.of(
            new SystemDefinition("erp", "ERP", "yoooni", List.of(
                    repository("yoooni", "yoooni"))),
            new SystemDefinition("erp-mini-program", "ERP 小程序", "frontend", List.of(
                    repository("frontend", "frontend"))),
            new SystemDefinition("srm", "SRM", "srm-system", List.of(
                    repository("srm", "srm-system/srm"),
                    repository("srm-admin-front-end", "srm-system/srm-admin-front-end"))),
            new SystemDefinition("scm", "SCM", "scm-system", List.of(
                    repository("SCM", "scm-system/SCM"),
                    repository("scm-front-end", "scm-system/scm-front-end")))
    );

    public List<SystemDefinition> systems() {
        return systems;
    }

    public SystemDefinition requireSystem(String systemId) {
        String normalized = systemId == null ? "" : systemId.trim();
        return systems.stream()
                .filter(system -> system.id().equals(normalized))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("未知业务系统：" + systemId));
    }

    private static RepositoryDefinition repository(String name, String relativePath) {
        Path path = Path.of(relativePath).normalize();
        if (path.isAbsolute() || path.startsWith("..")) {
            throw new IllegalStateException("业务仓库目录非法：" + relativePath);
        }
        return new RepositoryDefinition(name, path.toString(), GITEE_ROOT + name + ".git");
    }

    public record SystemDefinition(
            String id,
            String name,
            String workspaceName,
            List<RepositoryDefinition> repositories) {
    }

    public record RepositoryDefinition(String name, String relativePath, String repositoryUrl) {
    }
}
