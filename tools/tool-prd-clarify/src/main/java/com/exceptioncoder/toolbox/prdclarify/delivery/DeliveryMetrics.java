package com.exceptioncoder.toolbox.prdclarify.delivery;

import org.springframework.stereotype.Component;

/**
 * AI 交付中心的完成度、可信度与健康度纯计算规则。
 */
@Component
public class DeliveryMetrics {

    private static final int PRD_WEIGHT = 30;
    private static final int TDD_WEIGHT = 25;
    private static final int CODE_WEIGHT = 45;

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
     * 对已知阶段重新归一化权重，未知代码阶段不会被当作零分。
     */
    public int overallProgress(int prdScore, int tddScore, Integer codeScore) {
        int weighted = prdScore * PRD_WEIGHT + tddScore * TDD_WEIGHT;
        int weights = PRD_WEIGHT + TDD_WEIGHT;
        if (codeScore != null) {
            weighted += codeScore * CODE_WEIGHT;
            weights += CODE_WEIGHT;
        }
        return clamp(Math.round((float) weighted / weights));
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
}
