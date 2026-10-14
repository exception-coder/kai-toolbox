package com.exceptioncoder.forge.quality.application;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.junit.jupiter.api.Assertions.assertEquals;

class RuntimeScenarioLoaderTest {
    @TempDir Path root;

    @Test
    void mavenProjectRootIsOwnedByInvocation() throws Exception {
        Files.createDirectories(root.resolve(".forge"));
        Files.writeString(root.resolve(".forge/verify.yml"), """
                runtime:
                  scenarios:
                    - id: local
                      type: maven-test
                      projectRoot: /another-workspace
                      modules: [module]
                      tests: '*Test'
                """);
        var scenarios = RuntimeScenarioLoader.load(root);
        assertEquals(root.toRealPath().toString(), scenarios.getFirst().configuration().get("projectRoot"));
    }
}
