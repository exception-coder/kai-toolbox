package com.exceptioncoder.toolbox.common.requirement;

/**
 * 已确认需求登记命令。
 *
 * @param title 标题
 * @param description 描述
 * @param project 来源系统
 * @param module 来源模块
 * @param assigneeUserId 选择的工程师用户，可空
 */
public record RequirementRegistrationCommand(
        String title,
        String description,
        String project,
        String module,
        Long assigneeUserId
) {
}
