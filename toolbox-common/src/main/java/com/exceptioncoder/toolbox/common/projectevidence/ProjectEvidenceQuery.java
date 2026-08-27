package com.exceptioncoder.toolbox.common.projectevidence;

/** 项目理解查询的稳定输入，不暴露任一工具模块的领域对象。 */
public record ProjectEvidenceQuery(
        String title,
        String description,
        String project,
        String module,
        String engine,
        String model
) {
    public ProjectEvidenceQuery(String title, String description, String project, String module) {
        this(title, description, project, module, "codex", null);
    }
}
