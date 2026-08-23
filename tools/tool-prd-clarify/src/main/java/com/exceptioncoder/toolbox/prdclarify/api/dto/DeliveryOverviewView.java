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
            CodeScoreVariantsView codeScoreVariants,
            int overallProgress,
            OverallProgressVariantsView overallProgressVariants,
            String evidenceMode,
            int verifiedClaimCount,
            int invalidEvidenceCount,
            VerificationRunView verification,
            List<VerificationCommandView> availableVerificationCommands,
            ProgressItemsView progressItems,
            List<AlignmentFindingView> alignmentFindings,
            EffortProgressView effortProgress,
            int confidence,
            int healthScore,
            String healthGrade,
            List<String> staleReasons) {
    }

    /** 需求关联页面入口。 */
    public record RequirementLinksView(String prd, String development, String workspace) {
    }

    /** 从需求草稿到运行时的完整交付阶段链路。 */
    public record StageSetView(
            StageView prdDraft,
            StageView prdClarify,
            StageView prd,
            StageView tddClarify,
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
            List<ProgressItemView> missing,
            List<ProgressItemView> excluded) {
    }

    /** 单个功能点及其代码证据。 */
    public record ProgressItemView(
            String title,
            List<String> evidence,
            String implemented,
            String missing,
            String expected,
            String actual,
            boolean testItem,
            boolean unitTest) {
    }

    /**
     * 同一份扫描报告按两种测试计分口径计算出的代码实现度。
     *
     * @param includingTests 纳入测试时的代码实现度
     * @param excludingTests 不纳入测试时的代码实现度
     * @param testItemCount 报告中识别出的测试功能点数量
     * @param includingUnitTests 兼容旧版消费方，值与 includingTests 相同
     * @param excludingUnitTests 兼容旧版消费方，值与 excludingTests 相同
     * @param unitTestItemCount 报告中识别出的单元测试功能点数量，兼容旧版展示
     */
    public record CodeScoreVariantsView(
            Integer includingTests,
            Integer excludingTests,
            int testItemCount,
            Integer includingUnitTests,
            Integer excludingUnitTests,
            int unitTestItemCount) {
    }

    /** 服务端按测试是否纳入源码声明计分生成的两套权威总进度。 */
    public record OverallProgressVariantsView(int includingTests, int excludingTests) {
    }

    /** 最新白名单验证运行及其相对当前 Git HEAD 的有效性。 */
    public record VerificationRunView(
            String id,
            String commandId,
            String gitHead,
            String status,
            Integer exitCode,
            Integer testCount,
            String outputSummary,
            String lastError,
            long startedAt,
            Long finishedAt,
            boolean stale) {
    }

    /** 可由用户触发但不能修改 argv 的验证命令选项。 */
    public record VerificationCommandView(String id, String label) {
    }

    /** PRD 或开发文档与当前代码的差异。 */
    public record AlignmentFindingView(String requirement, String expected, String actual, String status) {
    }

    /**
     * “责任与时间”的总工时基线与最新代码分析结果的对照。剩余工时只按代码实现进度扣减，
     * 工作日统一按 6 个 AI 有效编码小时折算。
     */
    public record EffortProgressView(
            int baselineHoursMin,
            int baselineHoursMax,
            double baselineWorkdaysMin,
            double baselineWorkdaysMax,
            Integer codeProgress,
            int deliveryProgress,
            Double completedHoursMin,
            Double completedHoursMax,
            Double remainingHoursMin,
            Double remainingHoursMax,
            Double remainingWorkdaysMin,
            Double remainingWorkdaysMax,
            int hoursPerWorkday,
            long estimatedAt,
            Long analyzedAt,
            boolean baselineStale,
            List<String> baselineStaleReasons) {
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
