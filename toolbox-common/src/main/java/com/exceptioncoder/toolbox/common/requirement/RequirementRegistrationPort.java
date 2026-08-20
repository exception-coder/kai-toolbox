package com.exceptioncoder.toolbox.common.requirement;

/** 跨工具登记需求的稳定端口。 */
public interface RequirementRegistrationPort {

    /**
     * 创建一条待执行需求。
     *
     * @param command 已确认的登记命令
     * @return 新需求标识
     */
    String registerPendingExecution(RequirementRegistrationCommand command);
}
