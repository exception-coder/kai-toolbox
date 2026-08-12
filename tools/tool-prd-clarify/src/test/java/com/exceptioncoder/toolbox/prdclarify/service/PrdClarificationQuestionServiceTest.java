package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.api.dto.QaPairRequest;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
class PrdClarificationQuestionServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void generatesCanonicalBatchQuestionsAndForwardsStreamedOutput() throws Exception {
        RecordingRunner runner = new RecordingRunner(
                "[{\"id\":9,\"question\":\"目标用户是谁？\"},{\"question\":\"如何验收？\"}]");
        PrdImageInputResolver imageResolver = imageResolver();
        PrdClarificationQuestionService service = service(runner, imageResolver);
        List<String> chunks = new ArrayList<>();

        String result = service.generateBatchQuestions(
                session("PRODUCT", "NEW_MODULE", 2),
                "codex",
                new PrdClarificationQuestionService.KnowledgeContext("代码事实", "业务规则"),
                chunks::add);

        JsonNode questions = mapper.readTree(result);
        assertThat(questions.size()).isEqualTo(2);
        assertThat(questions.get(0).path("id").asInt()).isEqualTo(9);
        assertThat(questions.get(1).path("id").asInt()).isEqualTo(2);
        assertThat(questions.get(0).path("answer").asText()).isEmpty();
        assertThat(chunks).containsExactly(runner.response);
        assertThat(runner.userPrompt).contains("一次性提出 2 个澄清问题", "代码事实", "业务规则");
        assertThat(runner.systemPrompt).contains("批量澄清模式");
        assertThat(runner.engine).isEqualTo("codex");
        assertThat(runner.images).isEmpty();
    }

    @Test
    void acceptsFencedBatchJson() throws Exception {
        RecordingRunner runner = new RecordingRunner("```json\n[{\"question\":\"范围是什么？\"}]\n```");
        PrdClarificationQuestionService service = service(runner, imageResolver());

        String result = service.generateBatchQuestions(
                session("PRODUCT", "NEW_MODULE", 1), "claude", context(), ignored -> { });

        assertThat(mapper.readTree(result).get(0).path("question").asText()).isEqualTo("范围是什么？");
    }

    @Test
    void fallsBackToOneQuestionWhenBatchOutputIsInvalid() throws Exception {
        RecordingRunner runner = new RecordingRunner("not-json");
        PrdClarificationQuestionService service = service(runner, imageResolver());

        String result = service.generateBatchQuestions(
                session("PRODUCT", "NEW_MODULE", 3), "claude", context(), ignored -> { });

        JsonNode questions = mapper.readTree(result);
        assertThat(questions.size()).isEqualTo(1);
        assertThat(questions.get(0).path("question").asText())
                .isEqualTo("请进一步描述您的核心需求和期望效果");
    }

    @Test
    void usesBugPromptAndBuildsProgressiveHistoryContext() {
        RecordingRunner runner = new RecordingRunner("发生在哪个步骤？");
        PrdClarificationQuestionService service = service(runner, imageResolver());
        List<String> chunks = new ArrayList<>();

        service.streamNextQuestion(
                session("BUSINESS", "BUG_FIX", 4),
                1,
                List.of(new QaPairRequest("何时发生？", "保存时")),
                "claude",
                new PrdClarificationQuestionService.KnowledgeContext("SaveService", "保存规则"),
                chunks::add);

        assertThat(runner.systemPrompt).contains("缺陷修复的极简澄清路径");
        assertThat(runner.userPrompt).contains("问：何时发生？", "答：保存时", "SaveService", "保存规则");
        assertThat(runner.userPrompt).contains("这是第 2 个问题", "还可以最多再问 2 个");
        assertThat(chunks).containsExactly("发生在哪个步骤？");
    }

    @Test
    void usesBusinessPromptForNonBugBusinessSession() {
        RecordingRunner runner = new RecordingRunner("哪些业务人员会使用？");
        PrdClarificationQuestionService service = service(runner, imageResolver());

        service.streamNextQuestion(
                session("BUSINESS", "MODULE_ADJUST", 5), 0, List.of(), "claude", context(), ignored -> { });

        assertThat(runner.systemPrompt).contains("业务人员视角");
    }

    @Test
    void usesProductPromptAndLegacyQuestionLimitForDefaultSession() {
        RecordingRunner runner = new RecordingRunner("目标是什么？");
        PrdClarificationQuestionService service = service(runner, imageResolver());

        service.streamNextQuestion(
                session("PRODUCT", "NEW_MODULE", 0), 0, List.of(), "claude", context(), ignored -> { });

        assertThat(runner.systemPrompt).contains("产品/开发视角");
        assertThat(runner.userPrompt).contains("本次澄清最多 5 轮", "还可以最多再问 4 个");
    }

    private PrdClarificationQuestionService service(RecordingRunner runner,
                                                    PrdImageInputResolver imageResolver) {
        return new PrdClarificationQuestionService(runner, mapper, imageResolver);
    }

    private static PrdImageInputResolver imageResolver() {
        return new PrdImageInputResolver(new ImageAttachmentStorageService());
    }

    private static PrdClarificationQuestionService.KnowledgeContext context() {
        return new PrdClarificationQuestionService.KnowledgeContext("", "");
    }

    private static PrdSession session(String role, String reqType, int maxQuestions) {
        return PrdSession.builder()
                .id("session-1")
                .title("库存调整")
                .project("kai-toolbox")
                .module("prd-clarify")
                .rawInput("原始需求")
                .role(role)
                .reqType(reqType)
                .maxQuestions(maxQuestions)
                .model("model-a")
                .engine("claude")
                .build();
    }

    private static final class RecordingRunner implements AgentOneShotRunner {
        private final String response;
        private String systemPrompt;
        private String userPrompt;
        private String engine;
        private List<ImageInput> images = List.of();

        private RecordingRunner(String response) {
            this.response = response;
        }

        @Override
        public String stream(String systemPrompt, String userPrompt, String model, String engine,
                             Consumer<String> onDelta) {
            return stream(systemPrompt, userPrompt, model, engine, onDelta, List.of());
        }

        @Override
        public String stream(String systemPrompt, String userPrompt, String model, String engine,
                             Consumer<String> onDelta, List<ImageInput> images) {
            this.systemPrompt = systemPrompt;
            this.userPrompt = userPrompt;
            this.engine = engine;
            this.images = List.copyOf(images);
            onDelta.accept(response);
            return response;
        }

        @Override
        public String runOnce(String systemPrompt, String userPrompt, String model, String engine) {
            throw new UnsupportedOperationException("runOnce is not used by clarification questions");
        }
    }
}
