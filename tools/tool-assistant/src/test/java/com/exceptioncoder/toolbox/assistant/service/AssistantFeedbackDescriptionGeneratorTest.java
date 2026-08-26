package com.exceptioncoder.toolbox.assistant.service;

import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackCategory;
import com.exceptioncoder.toolbox.common.assistant.AssistantFeedbackStorePort.FeedbackContext;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;

import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Queue;

import static org.assertj.core.api.Assertions.assertThat;

/** 三类反馈最佳实践描述生成契约测试。 */
class AssistantFeedbackDescriptionGeneratorTest {

    private static final FeedbackContext CONTEXT = new FeedbackContext(
            7L, "session-1", "yoooni-one", "/new-product-progress", "新品生产进度");

    @Test
    void rendersBugWithFixedSectionsAndPageContext() {
        String markdown = generator("""
                {"title":"新品进度备注加载失败","background":"","currentBehavior":"页面进入错误状态",\
                "expectedBehavior":"无备注时展示暂无备注","userScenario":"","reproductionSteps":["打开新品进度页面"],\
                "scopeItems":[],"rules":[],"nonGoals":[],"impact":"阻断用户查看进度",\
                "acceptanceCriteria":["无备注记录不再触发整页错误"]}
                """).generate(FeedbackCategory.BUG, "备注打不开", "", CONTEXT);

        assertThat(markdown)
                .contains("## 问题概述", "新品进度备注加载失败")
                .contains("## 发生页面与业务模块", "页面地址：/new-product-progress")
                .contains("## 复现步骤", "- 打开新品进度页面")
                .contains("## 验收标准", "- 无备注记录不再触发整页错误");
    }

    @Test
    void rendersRequirementAndOptimizationWithDifferentTemplates() {
        String requirement = generator("""
                {"title":"增加批量导出","background":"需要减少逐条下载成本","currentBehavior":"",\
                "expectedBehavior":"","userScenario":"运营人员筛选记录后批量导出",\
                "reproductionSteps":[],"scopeItems":["支持导出当前筛选结果"],"rules":["遵循数据权限"],\
                "nonGoals":["不支持跨系统合并"],"impact":"","acceptanceCriteria":["导出结果与筛选条件一致"]}
                """).generate(FeedbackCategory.REQUIREMENT, "希望支持批量导出", "", CONTEXT);
        String optimization = generator("""
                {"title":"优化导出反馈","background":"","currentBehavior":"导出期间没有进度提示",\
                "expectedBehavior":"用户可以看到进度和失败原因","userScenario":"","reproductionSteps":[],\
                "scopeItems":["展示导出进度"],"rules":["记录成功率"],"nonGoals":[],\
                "impact":"不改变导出数据口径","acceptanceCriteria":["导出期间持续显示进度"]}
                """).generate(FeedbackCategory.OPTIMIZATION, "导出没有反馈", "", CONTEXT);

        assertThat(requirement).contains("## 需求标题", "## 功能范围", "## 非目标范围");
        assertThat(optimization).contains("## 优化标题", "## 当前痛点", "## 效果衡量方式");
    }

    @Test
    void fallsBackToDeterministicTemplateAfterInvalidModelOutput() {
        String markdown = generator("not-json", "still-not-json")
                .generate(FeedbackCategory.BUG, "页面加载失败", "", CONTEXT);

        assertThat(markdown)
                .contains("## 问题概述\n页面加载失败")
                .contains("## 当前表现\n页面加载失败")
                .contains("## 期望结果\n待补充")
                .contains("补充并确认可验证的验收标准");
    }

    private AssistantFeedbackDescriptionGenerator generator(String... responses) {
        StaticListableBeanFactory beans = new StaticListableBeanFactory();
        beans.addBean("runner", new StubRunner(responses));
        return new AssistantFeedbackDescriptionGenerator(
                beans.getBeanProvider(AgentOneShotRunner.class), new ObjectMapper(), 1_000L);
    }

    private static final class StubRunner implements AgentOneShotRunner {
        private final Queue<String> responses;

        private StubRunner(String... responses) {
            this.responses = new ArrayDeque<>(Arrays.asList(responses));
        }

        @Override
        public String stream(String systemPrompt, String userPrompt, String model, String engine,
                             java.util.function.Consumer<String> onDelta) {
            return response();
        }

        @Override
        public String runOnce(String systemPrompt, String userPrompt, String model, String engine) {
            return response();
        }

        private String response() {
            return responses.isEmpty() ? "not-json" : responses.remove();
        }
    }
}
