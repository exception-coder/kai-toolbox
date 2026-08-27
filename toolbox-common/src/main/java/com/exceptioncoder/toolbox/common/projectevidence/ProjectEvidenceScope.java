package com.exceptioncoder.toolbox.common.projectevidence;

import java.util.List;

/**
 * 一次证据探索允许访问的完整项目范围。
 *
 * @param scopeId 范围标识
 * @param primary 主项目
 * @param relatedProjects 已登记关联项目
 */
public record ProjectEvidenceScope(
        String scopeId,
        ProjectEvidenceProject primary,
        List<ProjectEvidenceProject> relatedProjects
) {
    public ProjectEvidenceScope {
        relatedProjects = List.copyOf(relatedProjects);
    }

    /** 返回包含主项目在内的有序查询范围。 */
    public List<ProjectEvidenceProject> projects() {
        java.util.ArrayList<ProjectEvidenceProject> projects = new java.util.ArrayList<>(relatedProjects.size() + 1);
        projects.add(primary);
        projects.addAll(relatedProjects);
        return List.copyOf(projects);
    }
}
