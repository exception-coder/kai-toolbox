package com.exceptioncoder.toolbox.prdclarify.domain;

import java.util.Locale;

/** PRD 会话可生成的持久化产物类型。 */
public enum PrdArtifactType {

    /** 产品需求文档。 */
    PRD(""),

    /** 面向开发的技术文档。 */
    DEV_DOC("-dev"),

    /** 基于代码证据生成的进度报告。 */
    PROGRESS("-progress");

    private final String canonicalSuffix;

    PrdArtifactType(String canonicalSuffix) {
        this.canonicalSuffix = canonicalSuffix;
    }

    /** 返回兼容旧接口的主文件名。 */
    public String canonicalFileName(String sessionId) {
        return sessionId + canonicalSuffix + ".md";
    }

    /** 返回账本版本对应的不可变相对路径。 */
    public String versionedRelativePath(String sessionId, int version) {
        return ".artifacts/" + sessionId + "/" + name().toLowerCase(Locale.ROOT)
                + "/v" + version + ".md";
    }
}
