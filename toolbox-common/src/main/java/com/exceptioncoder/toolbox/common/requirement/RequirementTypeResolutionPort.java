package com.exceptioncoder.toolbox.common.requirement;

/** 跨工具共享的需求类型解析能力边界。 */
public interface RequirementTypeResolutionPort {

    /**
     * 根据需求事实解析类型。实现必须把模型输出视为不可信输入。
     *
     * @param title       需求标题
     * @param description 需求描述
     * @param model       可选模型名称
     * @param engine      可选执行引擎
     * @return 白名单校验后的解析结果
     */
    RequirementTypeResolution resolveRequirementType(
            String title,
            String description,
            String model,
            String engine
    );
}
