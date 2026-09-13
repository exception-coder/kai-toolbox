package com.exceptioncoder.toolbox.common.project;

import java.nio.file.Path;
import java.util.List;

/** 项目发现及本地操作共用的目录范围和扫描策略。 */
public interface ProjectDirectorySource {
    List<Path> scanRoots();
    boolean contains(Path path);
    List<String> hiddenPrefixes();
    int cacheTtlSeconds();
}
