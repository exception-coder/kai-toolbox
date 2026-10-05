package com.exceptioncoder.forge.quality.application;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import static org.junit.jupiter.api.Assertions.assertEquals;

class ProjectScannerTest {
    @TempDir Path root;

    @Test
    void excludesRootScratchCopiesButKeepsProjectSources() throws Exception {
        for (String file : List.of(".tmp/copy/Mapper.xml", ".runtime/old-source/Mapper.java", ".codex-work/copy/pom.xml",
                ".codex-work-test/Main.java", "target/generated.java", "src/Main.java",
                "src/.tmp/fixture.xml")) {
            Path target = root.resolve(file);
            Files.createDirectories(target.getParent());
            Files.writeString(target, "fixture");
        }
        assertEquals(List.of(root.resolve("src/.tmp/fixture.xml"), root.resolve("src/Main.java")),
                ProjectScanner.scan(root));
        assertEquals(List.of(root.resolve(".codex-work/copy/pom.xml")),
                ProjectScanner.scan(root.resolve(".codex-work")));
    }
}
