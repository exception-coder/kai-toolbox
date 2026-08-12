package com.exceptioncoder.toolbox.claudechat.service;

import org.junit.jupiter.api.Test;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class BusinessWorkspaceCatalogTest {

    private final BusinessWorkspaceCatalog catalog = new BusinessWorkspaceCatalog();

    @Test
    void exposesFourSystemsAndSixVerifiedGiteeRepositories() {
        assertThat(catalog.systems()).extracting(BusinessWorkspaceCatalog.SystemDefinition::id)
                .containsExactly("erp", "erp-mini-program", "srm", "scm");
        assertThat(catalog.systems())
                .flatExtracting(BusinessWorkspaceCatalog.SystemDefinition::repositories)
                .hasSize(6)
                .allSatisfy(repository -> {
                    assertThat(repository.repositoryUrl()).startsWith("https://gitee.com/wyoooni/");
                    assertThat(repository.relativePath()).doesNotStartWith("..");
                });
        assertThat(catalog.requireSystem("srm").repositories())
                .extracting(BusinessWorkspaceCatalog.RepositoryDefinition::relativePath)
                .containsExactly(
                        Path.of("srm-system", "srm").toString(),
                        Path.of("srm-system", "srm-admin-front-end").toString());
    }
}
