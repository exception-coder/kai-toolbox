package com.exceptioncoder.toolbox.common.projectevidence;

import java.util.List;

/**
 * 项目、模块与 URL 解析后的受控证据上下文。
 *
 * @param requestedProject 原始项目输入
 * @param projectKey 团队知识项目键
 * @param projectPath 本机受控源码根
 * @param displayName 项目显示名
 * @param aliases 可用于路由的系统或项目别名
 * @param bindingSource 绑定来源
 * @param requestedModule 原始模块输入
 * @param requestedUrl 原始 URL 输入
 * @param modules 项目全部已识别模块
 * @param matchedModules 与模块输入匹配的候选
 * @param urlRouteMatches URL Route Map 的命中证据
 * @param evidenceScope 主项目与关联项目证据范围
 * @param diagnostics 非阻断诊断说明
 */
public record ProjectRouteContext(
        String requestedProject,
        String projectKey,
        String projectPath,
        String displayName,
        List<String> aliases,
        String bindingSource,
        String requestedModule,
        String requestedUrl,
        List<ProjectRouteModule> modules,
        List<ProjectRouteModule> matchedModules,
        List<String> urlRouteMatches,
        ProjectEvidenceScope evidenceScope,
        List<String> diagnostics
) {
    public ProjectRouteContext {
        aliases = List.copyOf(aliases);
        modules = List.copyOf(modules);
        matchedModules = List.copyOf(matchedModules);
        urlRouteMatches = List.copyOf(urlRouteMatches);
        diagnostics = List.copyOf(diagnostics);
    }
}
