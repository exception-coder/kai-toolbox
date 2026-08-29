package com.exceptioncoder.toolbox.claudechat.config;

import org.junit.jupiter.api.Test;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class BusinessWorkspacePropertiesTest {

    @Test
    void defaultsToManagedSourcesDirectoryWithoutUserConfiguration() {
        BusinessWorkspaceProperties properties = new BusinessWorkspaceProperties();

        assertThat(properties.resolveRoot()).isEqualTo(
                Path.of(System.getProperty("user.home"), ".kai-toolbox", "sources")
                        .toAbsolutePath().normalize());
    }
}
