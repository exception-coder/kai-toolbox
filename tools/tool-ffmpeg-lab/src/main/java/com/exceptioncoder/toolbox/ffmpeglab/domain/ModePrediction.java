package com.exceptioncoder.toolbox.ffmpeglab.domain;

/**
 * 探测阶段对某模式能否出 web 的预判。仅为提示，最终结论以实跑结果为准。
 */
public enum ModePrediction {
    /** 不重编码即可（源已原生可播 / copy 条件满足）。 */
    OK,
    /** 需要重编码，但预期能成功输出。 */
    TRANSCODE,
    /** 预判不可行（如 copy 模式遇到非兼容编码）。 */
    FAIL
}
