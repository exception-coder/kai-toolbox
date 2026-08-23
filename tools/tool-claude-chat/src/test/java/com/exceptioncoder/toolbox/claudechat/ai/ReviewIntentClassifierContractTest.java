package com.exceptioncoder.toolbox.claudechat.ai;

import dev.langchain4j.service.SystemMessage;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

class ReviewIntentClassifierContractTest {

    @Test
    void treatsExplicitFunctionalGoalsAsRequirementsWithoutDemandingImplementationDetails() throws Exception {
        SystemMessage annotation = ReviewIntentClassifier.class
                .getMethod("classify", String.class)
                .getAnnotation(SystemMessage.class);

        String instructions = String.join("\n", Arrays.asList(annotation.value()));

        assertThat(instructions)
                .contains("功能目标和期望结果明确时")
                .contains("没有补齐实现细节", "也应判为 REQUIREMENT")
                .contains("不要因为表达简短或格式不完整而判 UNKNOWN");
    }
}
