package com.exceptioncoder.toolbox.foreconsult.domain.teaching;

/** 一次执行明确绑定版本，不接受客户端成绩或工具权限。 */
public record TeachingRequest(
        /** 保存的配置版本。 */ Long version,
        /** DEMO 或 LIVE。 */ String mode,
        /** 固定演示场景 ID。 */ String scenarioId,
        /** 用户原文。 */ String input,
        /** 上一份草稿，仍视为不可信输入。 */ OrderDraft previous) {
    public void validate() {
        if (version == null || version < 1) {
            throw new IllegalArgumentException("请先保存并选择配置版本");
        }
        if (!"DEMO".equals(mode) && !"LIVE".equals(mode)) {
            throw new IllegalArgumentException("运行模式须为 DEMO 或 LIVE");
        }
        if (input == null || input.isBlank() || input.length() > 4000) {
            throw new IllegalArgumentException("输入须为 1 至 4000 字符");
        }
        if (previous != null) {
            TeachingOrderRules.validate(previous.styleCode(), previous.quantity(), 100000);
        }
        if ("DEMO".equals(mode) && !TeachingScenario.find(scenarioId).input().equals(input)) {
            throw new IllegalArgumentException("固定脚本演示只能运行所选样本；自由输入请切换真实模型");
        }
    }
}
