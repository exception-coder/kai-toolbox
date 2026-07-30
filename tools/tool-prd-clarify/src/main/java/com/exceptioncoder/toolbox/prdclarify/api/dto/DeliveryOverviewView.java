package com.exceptioncoder.toolbox.prdclarify.api.dto;

import java.util.List;

/**
 * AI 交付中心的只读聚合视图，不包含任何本地绝对文件路径。
 *
 * @param generatedAt 投影生成时间
 * @param summary 总体指标
 * @param filters 可用筛选项
 * @param requirements 需求投影
 * @param findings 交付发现
 * @param warnings 非致命降级信息
 */
public record DeliveryOverviewView(
        long generatedAt,
        SummaryView summary,
        FilterOptionsView filters,
        List<RequirementView> requirements,
        List<FindingView> findings,
        List<String> warnings) {

    /**
     * 看板顶部汇总指标。
     */
    public record SummaryView(
            int requirementCount,
            int prdCompletion,
            int tddCompletion,
            Integer codeProgress,
            int assessmentCoverage,
            int overallProgress,
            int confidence,
            int healthScore,
            String healthGrade,
            int completedCount,
            int partialCount,
            int missingCount,
            int unassessedCount,
            int highRiskCount) {
    }

    /** 看板可用项目与模块筛选项。 */
    public record FilterOptionsView(List<String> projects, List<String> modules) {
    }

    /**
     * 单条 PRD 的交付投影。
     */
    public record RequirementView(
            String id,
            String parentId,
            String title,
            String project,
            String module,
            String status,
            long updatedAt,
            RequirementLinksView links,
            StageSetView stages,
            CoverageView coverage,
            ProgressItemsView progressItems,
            List<AlignmentFindingView> alignmentFindings,
            int confidence,
            int healthScore,
            String healthGrade,
            List<String> staleReasons) {
    }

    /** 需求关联页面入口。 */
    public record RequirementLinksView(String prd, String development, String workspace) {
    }

    /** PRD、TDD、代码、测试和运行时五阶段。 */
    public record StageSetView(
            StageView prd,
            StageView tdd,
            StageView code,
            StageView test,
            StageView runtime) {
    }

    /** 单个交付阶段状态。 */
    public record StageView(String status, Integer score, Long updatedAt, String note) {
    }

    /** 功能点覆盖统计。 */
    public record CoverageView(int completed, int partial, int missing, int total) {
    }

    /** 按完成状态分组的功能点。 */
    public record ProgressItemsView(
            List<ProgressItemView> completed,
            List<ProgressItemView> partial,
            List<ProgressItemView> missing) {
    }

    /** 单个功能点及其代码证据。 */
    public record ProgressItemView(
            String title,
            List<String> evidence,
            String implemented,
            String missing,
            String expected,
            String actual) {
    }

    /** PRD 或开发文档与当前代码的差异。 */
    public record AlignmentFindingView(String requirement, String expected, String actual, String status) {
    }

    /** 一条可定位到需求的交付发现。 */
    public record FindingView(
            String id,
            String requirementId,
            String type,
            String severity,
            String title,
            String evidence,
            String recommendation) {
    }
}
