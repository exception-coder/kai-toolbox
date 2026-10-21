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

    /** 按来源对象稳定登记；实现必须保证重试不会创建另一项任务。 */
    default String registerPendingExecutionOnce(String sourceKey, RequirementRegistrationCommand command) {
        throw new UnsupportedOperationException("当前需求登记器尚不支持幂等任务登记");
    }

    enum ImplementationStatus { PENDING_EXECUTION, IN_DEV, READY_FOR_RELEASE }

    /** 仅更新该来源创建的任务，不能复活已完成/取消任务。 */
    default void updateImplementationStatus(String sourceKey, String requirementId, ImplementationStatus status) {
        throw new UnsupportedOperationException("当前需求登记器尚不支持开发状态回写");
    }
}
