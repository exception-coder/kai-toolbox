package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PrdAnswerProcessingServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void distributesAnswersAndRejectsUntrustedIndexesAndDuplicates() {
        RecordingRunner runner = new RecordingRunner("""
                {"answers":[
                  {"index":2,"answer":"  第二题答案  "},
                  {"index":2,"answer":"重复答案"},
                  {"index":4,"answer":"越界答案"},
                  {"index":1,"answer":""}
                ],"leftover":"  额外说明  "}
                """);
        PrdAnswerProcessingService service = new PrdAnswerProcessingService(runner, mapper);

        PrdAnswerProcessingService.DistributionResult result =
                service.distribute(session("claude"), "整段原始回答", "codex");

        assertThat(result.answers()).containsExactly("", "第二题答案", "");
        assertThat(result.matchedCount()).isEqualTo(1);
        assertThat(result.unmatchedNumbers()).containsExactly(1, 3);
        assertThat(result.leftover()).isEqualTo("额外说明");
        assertThat(runner.systemPrompt).contains("只做归类和摘录");
        assertThat(runner.userPrompt).contains("1. 问题一", "3. 问题三", "整段原始回答");
        assertThat(runner.engine).isEqualTo("codex");
    }

    @Test
    void acceptsFencedDistributionJson() {
        RecordingRunner runner = new RecordingRunner(
                "```json\n{\"answers\":[{\"index\":1,\"answer\":\"答案\"}],\"leftover\":\"\"}\n```");
        PrdAnswerProcessingService service = new PrdAnswerProcessingService(runner, mapper);

        PrdAnswerProcessingService.DistributionResult result =
                service.distribute(session("claude"), "答案", "claude");

        assertThat(result.answers()).containsExactly("答案", "", "");
    }

    @Test
    void failsExplicitlyWhenQuestionsOrModelOutputAreInvalid() {
        PrdAnswerProcessingService service =
                new PrdAnswerProcessingService(new RecordingRunner("not-json"), mapper);

        assertThatThrownBy(() -> service.distribute(sessionWithQuestions("bad-json"), "答案", "claude"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("当前会话还没有澄清问题，无法分配回答");
        assertThatThrownBy(() -> service.distribute(session("claude"), "答案", "claude"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("AI 整理结果解析失败，请改用逐题填写");
    }

    @Test
    void mergesAnswersWithoutChangingQuestionIdentityOrOrder() throws Exception {
        PrdAnswerProcessingService service =
                new PrdAnswerProcessingService(new RecordingRunner("unused"), mapper);

        JsonNode merged = mapper.readTree(service.mergeAnswers(
                session("claude").getQuestions(), List.of("答案一", "答案二")));

        assertThat(merged.size()).isEqualTo(3);
        assertThat(merged.get(0).path("id").asInt()).isEqualTo(7);
        assertThat(merged.get(0).path("question").asText()).isEqualTo("问题一");
        assertThat(merged.get(0).path("answer").asText()).isEqualTo("答案一");
        assertThat(merged.get(1).path("answer").asText()).isEqualTo("答案二");
        assertThat(merged.get(2).path("answer").asText()).isEmpty();
    }

    private static PrdSession session(String engine) {
        return sessionWithQuestions("""
                [{"id":7,"question":"问题一","answer":""},
                 {"id":8,"question":"问题二","answer":""},
                 {"id":9,"question":"问题三","answer":""}]
                """, engine);
    }

    private static PrdSession sessionWithQuestions(String questions) {
        return sessionWithQuestions(questions, "claude");
    }

    private static PrdSession sessionWithQuestions(String questions, String engine) {
        return PrdSession.builder()
                .id("session-1")
                .questions(questions)
                .model("model-a")
                .engine(engine)
                .build();
    }

    private static final class RecordingRunner implements AgentOneShotRunner {
        private final String response;
        private String systemPrompt;
        private String userPrompt;
        private String engine;

        private RecordingRunner(String response) {
            this.response = response;
        }

        @Override
        public String stream(String systemPrompt, String userPrompt, String model, String engine,
                             Consumer<String> onDelta) {
            throw new UnsupportedOperationException("stream is not used by answer processing");
        }

        @Override
        public String runOnce(String systemPrompt, String userPrompt, String model, String engine) {
            this.systemPrompt = systemPrompt;
            this.userPrompt = userPrompt;
            this.engine = engine;
            return response;
        }
    }
}
