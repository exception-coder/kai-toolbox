package com.exceptioncoder.toolbox.common.project;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** 以本机文件系统规则比较项目路径；解析已存在父路径以覆盖符号链接别名。 */
public final class ProjectPaths {
    private ProjectPaths() { }

    public static Path canonical(Path input) {
        Path path = input.toAbsolutePath().normalize();
        if (Files.exists(path)) {
            try { return path.toRealPath(); }
            catch (IOException error) { throw new IllegalArgumentException("项目路径无法读取：" + path, error); }
        }
        Path parent = path.getParent();
        return parent == null ? path : canonical(parent).resolve(path.getFileName()).normalize();
    }
}
