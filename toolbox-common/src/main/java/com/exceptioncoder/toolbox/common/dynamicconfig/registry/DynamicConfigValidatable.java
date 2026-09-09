package com.exceptioncoder.toolbox.common.dynamicconfig.registry;

/** 配置块在候选值绑定完成后校验业务约束，不修改运行态。 */
public interface DynamicConfigValidatable {

    /** @throws IllegalArgumentException 配置不合法；错误消息不得包含秘密值 */
    void validateConfiguration();
}
