package com.exceptioncoder.toolbox.common.requirement;

import java.util.Arrays;

/**
 * AI 澄清策略使用的稳定需求类型。
 *
 * <p>它与业务侧原始分类 {@code business_requirement_type} 正交，不承担行业或部门分类语义。</p>
 */
public enum RequirementType {

    /** 现有功能行为不符合预期。 */
    BUG_FIX(2),

    /** 调整或优化已经存在的模块。 */
    MODULE_ADJUST(5),

    /** 建设此前不存在的新能力或新模块。 */
    NEW_MODULE(8),

    /** 尚未获得可靠分类结论。 */
    UNKNOWN(0);

    private final int defaultMaxQuestions;

    RequirementType(int defaultMaxQuestions) {
        this.defaultMaxQuestions = defaultMaxQuestions;
    }

    /**
     * 按持久化代码解析需求类型，未知值不会被伪装为某个业务类型。
     *
     * @param code 持久化或外部输入代码
     * @return 已知类型；空值或非法值返回 {@link #UNKNOWN}
     */
    public static RequirementType fromCode(String code) {
        if (code == null || code.isBlank()) {
            return UNKNOWN;
        }
        return Arrays.stream(values())
                .filter(type -> type != UNKNOWN && type.name().equals(code.trim()))
                .findFirst()
                .orElse(UNKNOWN);
    }

    /** @return PRD 澄清流程的默认最大提问轮数。 */
    public int defaultMaxQuestions() {
        return defaultMaxQuestions;
    }

    /** @return 是否已经得到可用于业务决策的明确分类。 */
    public boolean isClassified() {
        return this != UNKNOWN;
    }
}
