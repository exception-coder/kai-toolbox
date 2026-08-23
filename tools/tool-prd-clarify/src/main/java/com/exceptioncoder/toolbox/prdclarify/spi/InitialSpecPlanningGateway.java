package com.exceptioncoder.toolbox.prdclarify.spi;

/** 连接规格确认与外部需求规划能力的公开端口。 */
public interface InitialSpecPlanningGateway {

    /**
     * 快速登记规划任务，耗时评估必须由实现方异步执行。
     *
     * @param request 已确认的初始化规格快照
     */
    void schedule(InitialSpecPlanningRequest request);
}
