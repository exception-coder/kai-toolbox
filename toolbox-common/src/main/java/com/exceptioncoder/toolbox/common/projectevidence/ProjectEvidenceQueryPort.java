package com.exceptioncoder.toolbox.common.projectevidence;

/** 跨工具复用项目知识、代码图谱、DDL 与路由查询轨迹的只读端口。 */
public interface ProjectEvidenceQueryPort {

    /** 返回包含来源目标、命中状态与摘要的 JSON 轨迹。 */
    String queryTrace(ProjectEvidenceQuery query);
}
