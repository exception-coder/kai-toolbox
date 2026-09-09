package com.exceptioncoder.toolbox.procurement.infrastructure;

import java.nio.file.Files;
import java.nio.file.Path;

/** Maven 从 starter 启动时，默认脚本目录仍相对仓库根目录解析。 */
public final class ProcurementScriptPaths {
    private ProcurementScriptPaths() { }
    public static Path resolve(String directory, String filename) {
        return resolve(Path.of(System.getProperty("user.dir")), Path.of(directory), filename);
    }
    public static Path resolve(Path workingDirectory, Path directory, String filename) {
        Path candidate = workingDirectory.resolve(directory).resolve(filename).normalize().toAbsolutePath();
        if (!Files.isRegularFile(candidate) && !directory.isAbsolute()
                && workingDirectory.getFileName().toString().equals("toolbox-starter")) {
            Path root = workingDirectory.getParent();
            if (root != null && Files.isRegularFile(root.resolve("tools/tool-procurement/pom.xml"))) {
                candidate = root.resolve(directory).resolve(filename).normalize().toAbsolutePath();
            }
        }
        if (!Files.isRegularFile(candidate)) {
            throw new IllegalStateException("未找到招采脚本：" + candidate + "，请检查浏览器服务目录配置");
        }
        return candidate;
    }
}
