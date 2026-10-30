package com.exceptioncoder.toolbox.claudechat.service;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;

class ConsultClientMessageProjectorTest {

    @Test
    void legacyInstructionsAreNotExposedAsAUserQuestion() {
        String raw =
            "【业务咨询调度协议】consult-orchestration-v1\nprivate path\n用户原始问题：\n如何审核？\n\n【步骤 1：识别】\nprivate prompt";
        assertThat(ConsultClientMessageProjector.userText(raw)).isEqualTo(
            "如何审核？"
        );
        assertThat(
            ConsultClientMessageProjector.userText(
                "<consultation_history_data>private</consultation_history_data>"
            )
        ).doesNotContain("private");
    }

    @Test
    void ordinaryQuestionAndSqlRemainIntact() {
        assertThat(
            ConsultClientMessageProjector.userText(
                "请核对 SELECT * FROM orders WHERE id=7"
            )
        ).isEqualTo("请核对 SELECT * FROM orders WHERE id=7");
    }
}
