package com.exceptioncoder.toolbox.prdclarify.domain;

/** 产物账本与磁盘文件之间的核验状态。 */
public enum PrdArtifactState {

    /** 账本版本已经分配，文件写入或 READY 提交尚未完成。 */
    WRITING,

    /** 文件存在且摘要与账本一致。 */
    READY,

    /** 账本指向的文件不存在。 */
    MISSING,

    /** 文件存在，但摘要与账本不一致。 */
    CORRUPT
}
