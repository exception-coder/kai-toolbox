package com.exceptioncoder.toolbox.reqpool.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.EnumMap;
import java.util.Map;

/** 规划工时的版本化准则单一事实源。 */
public final class ReqPlanningAssessmentStandard {

    public static final String CRITERIA_VERSION = "initial-spec-planning-v4";
    public static final String PROMPT_VERSION = "initial-spec-planning-prompt-v5";
    public static final int EFFECTIVE_HOURS_PER_PERSON_DAY = 6;
    public static final int MAX_CAPABILITIES = 12;
    public static final int MAX_INITIAL_SPEC_CHARS = 120_000;
    public static final int MAX_CAPABILITY_BASE_HOURS = 60;
    public static final int MAX_TOTAL_BASE_HOURS = 240;

    private static final Map<WorkPackageType, HourRange> HOUR_RANGES = ranges();

    private ReqPlanningAssessmentStandard() {
    }

    /** 规划工作包封闭分类。 */
    public enum WorkPackageType {
        /** 需求核对、方案设计与评审。 */
        DISCOVERY_DESIGN,
        /** 后端业务、接口与持久化实现。 */
        BACKEND,
        /** 前端交互、状态与页面实现。 */
        FRONTEND,
        /** 表结构、迁移、数据修复与校验。 */
        DATA,
        /** 外部系统、跨模块协议与联调。 */
        INTEGRATION,
        /** 自动化测试、人工验收与回归。 */
        TEST_VERIFICATION
    }

    /** 评估信心封闭等级。 */
    public enum Confidence {
        /** 关键边界和证据充分。 */
        HIGH,
        /** 存在少量未决边界。 */
        MEDIUM,
        /** 关键范围或依赖仍不确定。 */
        LOW
    }

    /**
     * 返回工作包允许的基础工时范围。
     *
     * @param type 工作包类型
     * @return 合法范围
     */
    public static HourRange range(WorkPackageType type) {
        return HOUR_RANGES.get(type);
    }

    /**
     * 返回信心等级对应的不确定性上界缓冲。
     *
     * @param confidence 信心等级
     * @return 缓冲比例
     */
    public static BigDecimal bufferRate(Confidence confidence) {
        return switch (confidence) {
            case HIGH -> new BigDecimal("0.10");
            case MEDIUM -> new BigDecimal("0.25");
            case LOW -> new BigDecimal("0.40");
        };
    }

    /**
     * 将小时按统一口径换算成人日，保留一位小数。
     *
     * @param hours 小时数
     * @return 人日
     */
    public static BigDecimal personDays(int hours) {
        return BigDecimal.valueOf(hours)
                .divide(BigDecimal.valueOf(EFFECTIVE_HOURS_PER_PERSON_DAY), 1, RoundingMode.HALF_UP);
    }

    /**
     * 生成注入模型的准则正文，所有数值约定均来自本类常量。
     *
     * @return Prompt 准则片段
     */
    public static String promptContract() {
        StringBuilder text = new StringBuilder()
                .append("准则版本：").append(CRITERIA_VERSION).append('\n')
                .append("拆分口径：按业务领域、业务结果和独立验收边界拆分，不按技术文件拆分。\n")
                .append("估算口径：按 AI Code Agent 主导实现、人负责审查验收的有效工时估算，不使用传统纯人工工时。\n")
                .append("首版口径：选择可独立演示、可部署测试环境并可收集反馈的最小业务闭环；只返回范围与能力 ID，不返回自行计算的总量。\n")
                .append("共享的探索、基础设施、联调和回归成本只能归入一个最主要功能，不得在每个功能重复计算。\n")
                .append("每个功能必须完整返回以下六类工作包及基础工时区间：\n");
        for (WorkPackageType type : WorkPackageType.values()) {
            HourRange range = range(type);
            text.append("- ").append(type.name()).append(": ")
                    .append(range.minimum()).append('-').append(range.maximum()).append(" 小时\n");
        }
        return text.append("置信度缓冲：HIGH=")
                .append(bufferRate(Confidence.HIGH).movePointRight(2)).append("%，MEDIUM=")
                .append(bufferRate(Confidence.MEDIUM).movePointRight(2)).append("%，LOW=")
                .append(bufferRate(Confidence.LOW).movePointRight(2)).append("%。\n")
                .append("模型只建议基础工作包区间和首版能力集合，不输出权威总量；完整投入与首版工作日均由服务端计算。")
                .toString();
    }

    /** 工作包基础工时合法范围。 */
    public record HourRange(int minimum, int maximum) {
    }

    private static Map<WorkPackageType, HourRange> ranges() {
        EnumMap<WorkPackageType, HourRange> ranges = new EnumMap<>(WorkPackageType.class);
        ranges.put(WorkPackageType.DISCOVERY_DESIGN, new HourRange(0, 8));
        ranges.put(WorkPackageType.BACKEND, new HourRange(0, 24));
        ranges.put(WorkPackageType.FRONTEND, new HourRange(0, 20));
        ranges.put(WorkPackageType.DATA, new HourRange(0, 12));
        ranges.put(WorkPackageType.INTEGRATION, new HourRange(0, 12));
        ranges.put(WorkPackageType.TEST_VERIFICATION, new HourRange(0, 12));
        return Map.copyOf(ranges);
    }
}
