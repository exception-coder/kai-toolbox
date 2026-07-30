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
}
