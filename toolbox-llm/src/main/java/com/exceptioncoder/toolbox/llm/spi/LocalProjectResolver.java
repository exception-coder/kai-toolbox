package com.exceptioncoder.toolbox.llm.spi;

import java.util.Optional;

/**
 * 本地项目路径解析 SPI。
 *
 * <p>需求/PRD 模块只依赖项目名称，不应直接依赖 Vibe Coding 的工作区实现；由工作区模块
 * 在运行时提供名称到已配置、已校验本地目录的解析能力，供只读 Agent 分析使用。</p>
 */
public interface LocalProjectResolver {

    Optional<ProjectLocation> resolve(String projectName);

    record ProjectLocation(String name, String path) {
    }
}
