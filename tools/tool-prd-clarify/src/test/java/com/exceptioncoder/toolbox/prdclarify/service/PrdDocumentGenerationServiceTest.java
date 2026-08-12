package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.api.dto.QaPairRequest;
import com.exceptioncoder.toolbox.prdclarify.domain.DocumentProfile;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;

class PrdDocumentGenerationServiceTest {

    @Test
    void generatesClassicBugDocumentWithQuestionsExtraContextAndImages() {
        RecordingRunner runner = new RecordingRunner("第一段", "第二段");
        PrdDocumentGenerationService service = service(runner);
        List<String> chunks = new ArrayList<>();

        String result = service.generatePrd(
                new PrdDocumentGenerationService.PrdGenerationRequest(
                        session(DocumentProfile.CLASSIC, "BUG_FIX", "原始需求"), null,
                        "补充验收条件", false, "codex"),
                chunks::add);

        assertThat(result).isEqualTo("第一段第二段");
        assertThat(chunks).containsExactly("第一段", "第二段");
        assertThat(runner.systemPrompt).contains("缺陷修复说明");
        assertThat(runner.userPrompt).contains("原始需求描述", "Q1: 如何复现", "A1: 保存时报错", "补充验收条件");
        assertThat(runner.model).isEqualTo("model-a");
        assertThat(runner.engine).isEqualTo("codex");
        assertThat(runner.images).containsExactly(new AgentOneShotRunner.ImageInput("image-data", "image/png"));
    }

    @Test
    void updatesSpecDrivenPrdWithoutRenumberingProtocol() {
        RecordingRunner runner = new RecordingRunner("规格更新");
        PrdDocumentGenerationService service = service(runner);

        service.generatePrd(new PrdDocumentGenerationService.PrdGenerationRequest(
                session(DocumentProfile.SPEC_DRIVEN, "NEW_MODULE", "原始需求"),
                "# 当前核心规格", "新增规则", true, "claude"), ignored -> { });

        assertThat(runner.systemPrompt).contains("保留未变更条目的稳定 ID", "Deprecated");
        assertThat(runner.userPrompt).contains("=== 原版 PRD 内容 ===", "# 当前核心规格", "新增规则");
    }

    @Test
    void usesRevisionProtocolForFreshRevisionSession() {
        RecordingRunner runner = new RecordingRunner("修订版 PRD");
        PrdDocumentGenerationService service = service(runner);

        service.generatePrd(new PrdDocumentGenerationService.PrdGenerationRequest(
                session(DocumentProfile.CLASSIC, "NEW_MODULE", "【修订版 PRD】补充库存锁定规则"),
                null, null, false, "claude"), ignored -> { });

        assertThat(runner.systemPrompt).contains("## 0. 实现状态", "本版新增", "本版修改");
        assertThat(runner.userPrompt).contains("【修订版 PRD】补充库存锁定规则");
    }

    @Test
    void updatesClassicDevDocWithGraphAndTechnicalAnswers() {
        RecordingRunner runner = new RecordingRunner("更新后的 TDD");
        PrdDocumentGenerationService service = service(runner);

        service.generateDevDoc(new PrdDocumentGenerationService.DevDocGenerationRequest(
                session(DocumentProfile.CLASSIC, "NEW_MODULE", "原始需求"),
                "# PRD", "# 当前 TDD", "只改接口",
                List.of(new QaPairRequest("是否兼容旧接口？", "需要兼容")),
                "OrderService.update", true, "claude"), ignored -> { });

        assertThat(runner.systemPrompt).contains("基于已有开发文档的更新", "需调整");
        assertThat(runner.userPrompt).contains("OrderService.update", "=== 当前最新 PRD ===",
                "=== 当前开发文档 ===", "只改接口", "是否兼容旧接口？", "需要兼容");
    }

    @Test
    void fallsBackToFreshSpecExecutionPlanWhenUpdateHasNoBaseDocument() {
        RecordingRunner runner = new RecordingRunner("执行计划");
        PrdDocumentGenerationService service = service(runner);

        service.generateDevDoc(new PrdDocumentGenerationService.DevDocGenerationRequest(
                session(DocumentProfile.SPEC_DRIVEN, "NEW_MODULE", "原始需求"),
                "# 核心规格", "", null, List.of(), "", true, "codex"), ignored -> { });

        assertThat(runner.systemPrompt).contains("# [功能名称] · 执行计划", "PLAN-001");
        assertThat(runner.userPrompt).contains("以下是已确认的产品需求文档", "# 核心规格");
        assertThat(runner.userPrompt).doesNotContain("=== 当前开发文档 ===");
    }

    private static PrdDocumentGenerationService service(RecordingRunner runner) {
        PrdImageInputResolver imageResolver = new PrdImageInputResolver(new ImageAttachmentStorageService()) {
            @Override
            public List<AgentOneShotRunner.ImageInput> resolve(String rawInput) {
                return List.of(new AgentOneShotRunner.ImageInput("image-data", "image/png"));
            }
        };
        return new PrdDocumentGenerationService(runner, new ObjectMapper(), imageResolver);
    }

    private static PrdSession session(DocumentProfile profile, String reqType, String rawInput) {
        return PrdSession.builder()
                .id("session-1")
                .title("库存调整")
                .project("kai-toolbox")
                .module("prd-clarify")
                .rawInput(rawInput)
                .questions("[{\"id\":1,\"question\":\"如何复现\",\"answer\":\"保存时报错\"}]")
                .reqType(reqType)
                .documentProfile(profile.name())
                .model("model-a")
                .engine("claude")
                .build();
    }

    private static final class RecordingRunner implements AgentOneShotRunner {
        private final List<String> responseChunks;
        private String systemPrompt;
        private String userPrompt;
        private String model;
        private String engine;
        private List<ImageInput> images = List.of();

        private RecordingRunner(String... responseChunks) {
            this.responseChunks = List.of(responseChunks);
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
            this.model = model;
            this.engine = engine;
            this.images = List.copyOf(images);
            responseChunks.forEach(onDelta);
            return String.join("", responseChunks);
        }

        @Override
        public String runOnce(String systemPrompt, String userPrompt, String model, String engine) {
            throw new UnsupportedOperationException("runOnce is not used by document generation");
        }
    }
}
