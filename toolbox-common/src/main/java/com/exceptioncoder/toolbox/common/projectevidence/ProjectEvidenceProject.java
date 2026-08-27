package com.exceptioncoder.toolbox.common.projectevidence;

import java.util.Map;

/**
 * 平台校验后的项目证据坐标。
 *
 * @param projectKey 项目知识键
 * @param projectPath 规范绝对路径
 * @param relation 与主项目的关系
 * @param projectRole 证据语义角色
 * @param availability 各证据来源当前是否可用
 */
public record ProjectEvidenceProject(
        String projectKey,
        String projectPath,
        ProjectEvidenceRelation relation,
        ProjectEvidenceRole projectRole,
        Map<ProjectEvidenceSourceType, Boolean> availability
) {
    public ProjectEvidenceProject {
        availability = Map.copyOf(availability);
    }
}
