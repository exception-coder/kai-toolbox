package com.exceptioncoder.toolbox.common.projectevidence;

/** 项目之间对规划证据有影响的封闭关系。 */
public enum ProjectEvidenceRelation {
    PRIMARY,
    REFACTORS,
    MIGRATES_FROM,
    DEPENDS_ON,
    INTEGRATES_WITH
}
