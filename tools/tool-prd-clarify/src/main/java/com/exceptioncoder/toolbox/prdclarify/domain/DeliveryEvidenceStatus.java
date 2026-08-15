package com.exceptioncoder.toolbox.prdclarify.domain;

/** 源码证据经过服务端确定性校验后的状态。 */
public enum DeliveryEvidenceStatus {

    /** 文件、路径和行范围均有效，摘要由服务端计算。 */
    VERIFIED,

    /** 相对路径为空、为绝对路径或试图离开项目根。 */
    INVALID_PATH,

    /** 目标文件不存在或不是普通文件。 */
    MISSING_FILE,

    /** 文件存在但无法按 UTF-8 与字节流读取。 */
    UNREADABLE,

    /** 行范围不满足文件实际边界。 */
    INVALID_RANGE,

    /** 文件真实路径通过符号链接逃逸出项目根。 */
    OUTSIDE_PROJECT
}
