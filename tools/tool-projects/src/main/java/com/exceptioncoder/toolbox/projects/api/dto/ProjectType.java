package com.exceptioncoder.toolbox.projects.api.dto;

/**
 * 项目类型分类，按目录签名识别。优先级见 {@link com.exceptioncoder.toolbox.projects.service.ProjectTypeDetector}。
 *
 * <p>序列化为小写字符串与前端 TypeScript 字面量对齐。</p>
 */
public enum ProjectType {

    /** 含 pubspec.yaml */
    flutter,

    /** 含 pom.xml */
    maven,

    /** 含 build.gradle / build.gradle.kts / settings.gradle */
    gradle,

    /** 含 package.json */
    node,

    /** 含 pyproject.toml 或 requirements.txt */
    python,

    /** 仅含 .git，无以上签名 */
    git,

    /** 普通目录，无任何签名 */
    other
}
