package com.exceptioncoder.toolbox.common.requirement;

import java.util.Objects;

/**
 * 已验证的需求类型解析结果。
 *
 * @param type       需求类型
 * @param source     事实来源
 * @param confidence 置信度，范围为 {@code 0.0..1.0}
 */
public record RequirementTypeResolution(
        RequirementType type,
        RequirementTypeSource source,
        double confidence
) {

    /** 校验可信边界，禁止把不一致结果传播到调用方。 */
    public RequirementTypeResolution {
        Objects.requireNonNull(type, "type");
        Objects.requireNonNull(source, "source");
        if (!Double.isFinite(confidence) || confidence < 0 || confidence > 1) {
            throw new IllegalArgumentException("需求类型置信度必须在 0.0..1.0 之间");
        }
        if (type == RequirementType.UNKNOWN
                && (source != RequirementTypeSource.UNKNOWN || confidence != 0)) {
            throw new IllegalArgumentException("未知需求类型必须使用 UNKNOWN 来源和 0 置信度");
        }
    }

    /** @return 未获得可靠分类时的标准结果。 */
    public static RequirementTypeResolution unknown() {
        return new RequirementTypeResolution(
                RequirementType.UNKNOWN,
                RequirementTypeSource.UNKNOWN,
                0
        );
    }
}
