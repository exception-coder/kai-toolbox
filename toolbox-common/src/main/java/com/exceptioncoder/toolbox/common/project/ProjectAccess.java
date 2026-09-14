package com.exceptioncoder.toolbox.common.project;

import java.nio.file.Path;

/** 全平台项目使用政策；扫描结果和实际路径操作都必须核对。 */
public interface ProjectAccess {
    boolean allowed(Path path);

    default void requireAllowed(Path path) {
        if (!allowed(path)) {
            throw new IllegalArgumentException("项目已被全局排除，请在项目库的目录管理中恢复使用");
        }
    }
}
