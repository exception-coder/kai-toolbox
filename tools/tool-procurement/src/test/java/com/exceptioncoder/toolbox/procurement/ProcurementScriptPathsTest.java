package com.exceptioncoder.toolbox.procurement;

import com.exceptioncoder.toolbox.procurement.infrastructure.ProcurementScriptPaths;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.*;

class ProcurementScriptPathsTest {
    @TempDir Path root;
    @Test
    void starterWorkingDirectoryResolvesOnlyVerifiedRepositoryScripts() throws Exception {
        Path directory = Path.of("node-services/undetected-browser");
        Files.createDirectories(root.resolve(directory));
        Files.createDirectories(root.resolve("tools/tool-procurement"));
        Files.writeString(root.resolve("tools/tool-procurement/pom.xml"), "<project/>");
        Path script = Files.writeString(root.resolve(directory).resolve("procurement-discover.mjs"), "");
        assertThat(ProcurementScriptPaths.resolve(root, directory, script.getFileName().toString())).isEqualTo(script);
        assertThat(ProcurementScriptPaths.resolve(root.resolve("toolbox-starter"), directory, script.getFileName().toString())).isEqualTo(script);
        assertThatThrownBy(() -> ProcurementScriptPaths.resolve(root, root.resolve("missing"), "procurement-discover.mjs"))
                .hasMessageContaining("未找到招采脚本");
    }
}
