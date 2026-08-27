package com.exceptioncoder.toolbox.common.projectevidence;

/** 平台级项目证据范围解析端口。 */
public interface ProjectEvidenceScopeResolver {

    /**
     * 解析主项目和已登记关联项目，不接受模型提供的任意路径。
     *
     * @param project 项目名或已登记项目路径
     * @return 受控项目证据范围
     */
    ProjectEvidenceScope resolve(String project);
}
