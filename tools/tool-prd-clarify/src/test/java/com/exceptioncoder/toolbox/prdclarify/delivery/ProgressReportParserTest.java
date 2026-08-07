package com.exceptioncoder.toolbox.prdclarify.delivery;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ProgressReportParserTest {

    private final ProgressReportParser parser = new ProgressReportParser();

    @Test
    void parsesProgressItemsEvidenceAndAlignmentTable() {
        String markdown = """
                # 自动催报价 开发进度评估

                ## 已完成
                - [x] 公众号通知
                  - 证据：NotifyService.send / NotifyController.java

                ## 部分完成
                - [~] 短信通知
                  - 已实现：模板生成
                  - 缺失：发送通道

                ## 未完成
                - [ ] 自动重试
                  - 开发文档要求：失败后重试三次
                  - 当前代码：未找到实现

                ## 文档与代码差异
                | 需求 | 文档要求 | 当前代码 | 状态 |
                |---|---|---|---|
                | 短信通知 | 支持发送 | 只有模板 | 部分完成 |
                """;

        ProgressReportParser.ParsedProgressReport report = parser.parse(markdown);

        assertThat(report.completed()).hasSize(1);
        assertThat(report.completed().get(0).evidence()).containsExactly(
                "NotifyService.send / NotifyController.java");
        assertThat(report.partial()).singleElement()
                .satisfies(item -> assertThat(item.missing()).isEqualTo("发送通道"));
        assertThat(report.missing()).singleElement()
                .satisfies(item -> assertThat(item.expected()).isEqualTo("失败后重试三次"));
        assertThat(report.alignment()).singleElement()
                .satisfies(item -> assertThat(item.status()).isEqualTo("部分完成"));
        assertThat(report.total()).isEqualTo(3);
    }

    @Test
    void ignoresListsOutsideKnownSections() {
        String markdown = """
                ## 文档版本
                - [x] 这不是功能点

                ## 已完成
                - [X] 真实功能点
                """;

        ProgressReportParser.ParsedProgressReport report = parser.parse(markdown);

        assertThat(report.completed()).extracting(ProgressReportParser.ProgressItem::title)
                .containsExactly("真实功能点");
        assertThat(report.total()).isEqualTo(1);
    }

    @Test
    void returnsEmptyReportForBlankMarkdown() {
        assertThat(parser.parse("  ").total()).isZero();
    }

    @Test
    void acceptsAlignmentRowsWithoutTrailingPipe() {
        String markdown = """
                ## 文档与代码差异
                | 需求 | 文档要求 | 当前代码 | 状态
                |---|---|---|---
                | 自动重试 | 重试三次 | 未找到实现 | 未完成
                """;

        assertThat(parser.parse(markdown).alignment()).singleElement()
                .satisfies(item -> assertThat(item.requirement()).isEqualTo("自动重试"));
    }

    @Test
    void excludesAllTestItemsFromScoringWhenReportRequestsIt() {
        String markdown = """
                # 备注保存 开发进度评估
                <!-- TEST_SCORING: EXCLUDED -->

                ## 已完成
                - [x] 保存备注
                  - 证据：RemarkService.save

                ## 未完成
                - [ ] 单元测试 — 空字符串与 null 均清空备注
                  - 当前代码：未定位到对应测试
                - [ ] 接口测试 — 旧请求兼容
                  - 当前代码：未定位到接口测试
                - [ ] 安全测试 — 越权修改
                  - 当前代码：未定位到安全测试
                - [ ] 性能测试 — 批量保存
                  - 当前代码：未定位到性能测试
                - [ ] 数据迁移校验
                  - 当前代码：未定位到迁移脚本

                ## 观察项（不计分）
                - [-] 单元测试 — 无权限时拒绝修改
                  - 核查结果：未定位到对应测试代码
                  - 证据：RemarkService.java
                """;

        ProgressReportParser.ParsedProgressReport report = parser.parse(markdown);

        assertThat(report.testScoringIncluded()).isFalse();
        assertThat(report.missing()).extracting(ProgressReportParser.ProgressItem::title)
                .containsExactly("数据迁移校验");
        assertThat(report.excluded()).extracting(ProgressReportParser.ProgressItem::title)
                .containsExactly(
                        "单元测试 — 空字符串与 null 均清空备注",
                        "接口测试 — 旧请求兼容",
                        "安全测试 — 越权修改",
                        "性能测试 — 批量保存",
                        "单元测试 — 无权限时拒绝修改");
        assertThat(report.excluded()).allSatisfy(item -> assertThat(item.testItem()).isTrue());
        assertThat(report.excluded().get(4).actual()).isEqualTo("未定位到对应测试代码");
        assertThat(report.total()).isEqualTo(2);
    }

    @Test
    void treatsHistoricalReportsWithoutMarkerAsTestsIncluded() {
        ProgressReportParser.ParsedProgressReport report = parser.parse("""
                ## 未完成
                - [ ] 单元测试 — 保存备注
                - [ ] API Test — 保存备注接口
                """);

        assertThat(report.testScoringIncluded()).isTrue();
        assertThat(report.missing()).hasSize(2);
        assertThat(report.missing()).allSatisfy(item -> assertThat(item.testItem()).isTrue());
        assertThat(report.missing().get(0).unitTest()).isTrue();
        assertThat(report.missing().get(1).unitTest()).isFalse();
        assertThat(report.excluded()).isEmpty();
    }

    @Test
    void supportsLegacyUnitTestScoringMarkerAsAllTestsExcluded() {
        ProgressReportParser.ParsedProgressReport report = parser.parse("""
                <!-- UNIT_TEST_SCORING: EXCLUDED -->

                ## 未完成
                - [ ] 安全测试 — 权限绕过
                """);

        assertThat(report.testScoringIncluded()).isFalse();
        assertThat(report.missing()).isEmpty();
        assertThat(report.excluded()).singleElement()
                .satisfies(item -> assertThat(item.title()).contains("安全测试"));
    }
}
