package com.exceptioncoder.toolbox.prdclarify.delivery;

import org.springframework.stereotype.Component;

/**
 * AI 交付中心的完成度、可信度与健康度纯计算规则。
 */
@Component
public class DeliveryMetrics {

    private static final int PRD_WEIGHT = 10;
    private static final int TDD_WEIGHT = 10;
    private static final int CODE_WEIGHT = 80;
    /** 与需求中枢“责任与时间”工时评估保持同一口径：AI 每工作日按 6 个有效编码小时。 */
    public static final int AI_HOURS_PER_WORKDAY = 6;

    /**
     * 按完成、部分完成和未完成数量计算代码实现度。
     *
     * @return 百分比；没有功能点时返回 null
     */
    public Integer codeProgress(int completed, int partial, int missing) {
        int total = completed + partial + missing;
        if (total == 0) {
            return null;
        }
        return percent((completed + partial * 0.5) / total);
    }

    /**
     * 固定权重计算真实交付进度。PRD/TDD 只是前置证据，各占 10%；代码核查占 80%。
     * 未执行本地代码评估时代码按 0 分，而不是把文档阶段重新归一化成 100%。
     */
    public int overallProgress(int prdScore, int tddScore, Integer codeScore) {
        int weighted = prdScore * PRD_WEIGHT
                + tddScore * TDD_WEIGHT
                + (codeScore == null ? 0 : codeScore) * CODE_WEIGHT;
        return clamp(Math.round((float) weighted / 100));
    }

    /**
     * 用责任时间处保存的原始总工时作为固定基线，根据真实代码实现进度计算已完成量和剩余量。
     * PRD/TDD 是交付前置证据，不从编码工时中扣除；否则“文档完成即 20%”会错误地把尚未编码的
     * 工作量减少 20%。
     */
    public EffortProjection effortProjection(int baselineHoursMin, int baselineHoursMax, Integer codeScore) {
        int safeMin = Math.max(0, baselineHoursMin);
        int safeMax = Math.max(safeMin, baselineHoursMax);
        double baselineDaysMin = roundOne(safeMin / (double) AI_HOURS_PER_WORKDAY);
        double baselineDaysMax = roundOne(safeMax / (double) AI_HOURS_PER_WORKDAY);
        if (codeScore == null) {
            return new EffortProjection(
                    safeMin, safeMax, baselineDaysMin, baselineDaysMax,
                    null, null, null, null, null, null, null);
        }

        int progress = clamp(codeScore);
        double completedRatio = progress / 100d;
        double remainingRatio = 1d - completedRatio;
        double completedHoursMin = roundOne(safeMin * completedRatio);
        double completedHoursMax = roundOne(safeMax * completedRatio);
        double remainingHoursMin = roundOne(safeMin * remainingRatio);
        double remainingHoursMax = roundOne(safeMax * remainingRatio);
        return new EffortProjection(
                safeMin, safeMax, baselineDaysMin, baselineDaysMax, progress,
                completedHoursMin, completedHoursMax,
                remainingHoursMin, remainingHoursMax,
                roundOne(remainingHoursMin / AI_HOURS_PER_WORKDAY),
                roundOne(remainingHoursMax / AI_HOURS_PER_WORKDAY));
    }

    /**
     * 按事实源完整性与证据覆盖计算数据可信度。
     */
    public int confidence(
            boolean prdComplete,
            boolean tddPresent,
            boolean tddStale,
            boolean assessmentPresent,
            boolean assessmentStale,
            int completedWithoutEvidence) {
        int score = 100;
        score -= prdComplete ? 0 : 25;
        score -= tddPresent ? 0 : 15;
        score -= tddStale ? 10 : 0;
        score -= assessmentPresent ? 0 : 25;
        score -= assessmentStale ? 15 : 0;
        score -= Math.min(completedWithoutEvidence * 2, 10);
        return clamp(score);
    }

    /**
     * 按文档、评估和实现缺口计算交付健康度。
     */
    public int health(
            boolean prdComplete,
            boolean tddPresent,
            boolean tddStale,
            boolean assessmentPresent,
            boolean assessmentStale,
            int partial,
            int missing,
            int completedWithoutEvidence) {
        int score = 100;
        score -= prdComplete ? 0 : 30;
        score -= tddPresent ? 0 : 20;
        score -= tddStale ? 12 : 0;
        score -= assessmentPresent ? 0 : 20;
        score -= assessmentStale ? 15 : 0;
        score -= Math.min(missing * 4, 20);
        score -= Math.min(partial * 2, 10);
        score -= Math.min(completedWithoutEvidence * 2, 10);
        return clamp(score);
    }

    /** 将健康分转换为交付等级。 */
    public String grade(int score) {
        if (score >= 90) {
            return "A";
        }
        if (score >= 80) {
            return "B";
        }
        if (score >= 70) {
            return "C";
        }
        if (score >= 60) {
            return "D";
        }
        return "E";
    }

    private int percent(double ratio) {
        return clamp((int) Math.round(ratio * 100));
    }

    private int clamp(int value) {
        return Math.max(0, Math.min(100, value));
    }

    private double roundOne(double value) {
        return Math.round(value * 10d) / 10d;
    }

    /** 原工时基线与当前代码进度的确定性换算结果。 */
    public record EffortProjection(
            int baselineHoursMin,
            int baselineHoursMax,
            double baselineWorkdaysMin,
            double baselineWorkdaysMax,
            Integer codeProgress,
            Double completedHoursMin,
            Double completedHoursMax,
            Double remainingHoursMin,
            Double remainingHoursMax,
            Double remainingWorkdaysMin,
            Double remainingWorkdaysMax) {
    }
}
