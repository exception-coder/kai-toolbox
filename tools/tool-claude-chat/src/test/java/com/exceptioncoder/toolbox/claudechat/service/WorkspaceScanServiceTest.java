package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ProjectModulesResponse;
import com.exceptioncoder.toolbox.claudechat.config.WorkspaceProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.parallel.ResourceLock;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class WorkspaceScanServiceTest {

    @TempDir
    Path tempDir;

    @Test
    @ResourceLock("user.home")
    void loadsMultiPathModulesAndPathlessContainersWithoutDroppingChildren() throws Exception {
        String originalUserHome = System.getProperty("user.home");
        Path workspaceRoot = Files.createDirectories(tempDir.resolve("workspace"));
        Path projectRoot = Files.createDirectories(workspaceRoot.resolve("scm-system"));
        Path manifest = tempDir.resolve(".kai-toolbox/team-tools/project-domain-knowledge/knowledge")
                .resolve("scm-system/impl/modules.json");
        Files.createDirectories(manifest.getParent());
        Files.writeString(manifest, """
                {
                  "modules": [
                    {
                      "key": "weaving-factory",
                      "name": "织厂管理",
                      "webPaths": ["frontend/weaving", "frontend/yarn"],
                      "children": [
                        {"key": "weaving-page", "name": "生产通知单", "webPath": "frontend/weaving/page.vue"}
                      ]
                    },
                    {
                      "key": "menu-container",
                      "name": "菜单容器",
                      "children": [
                        {"key": "nested-page", "name": "下级页面", "webPath": "frontend/nested/page.vue"}
                      ]
                    },
                    {"key": "single-path", "name": "单路径模块", "webPath": "frontend/single"}
                  ]
                }
                """, StandardCharsets.UTF_8);

        WorkspaceProperties properties = new WorkspaceProperties();
        properties.setRoots(List.of(workspaceRoot.toString()));
        WorkspaceScanService service = new WorkspaceScanService(properties, new ObjectMapper());

        try {
            System.setProperty("user.home", tempDir.toString());
            ProjectModulesResponse response = service.scanModules(projectRoot.toString());

            assertThat(response.modules()).extracting(ProjectModulesResponse.ModuleView::name)
                    .containsExactly("织厂管理", "菜单容器", "单路径模块");
            assertThat(response.modules().get(0).webPaths()).hasSize(2);
            assertThat(response.modules().get(0).webPath()).endsWith("frontend\\weaving");
            assertThat(response.modules().get(1).children()).hasSize(1);
            assertThat(response.modules().get(1).absPath())
                    .isEqualTo(response.modules().get(1).children().get(0).absPath());
        } finally {
            System.setProperty("user.home", originalUserHome);
        }
    }
}
