package com.exceptioncoder.toolbox.videocondense.domain;

/**
 * 片段类型，由活动度 + freezedetect 推断，仅用于展示与默认配速。
 * v1 区分度有限（整帧分析），细分留到 v2 区域帧差。
 */
public enum SegmentType {
    NORMAL,
    TYPING,
    STREAMING,
    WAITING,
    KEY_MOMENT,
    FREEZE
}
