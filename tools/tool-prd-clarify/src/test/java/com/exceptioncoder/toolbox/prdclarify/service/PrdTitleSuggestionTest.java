package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class PrdTitleSuggestionTest {

    @Test
    void removesDuplicatedPrefixAndFormatsFullTitle() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        when(runner.runOnce(anyString(), anyString(), isNull(), eq("claude"), anyList()))
                .thenReturn("标题：SRM-采购询价-自动催报价。");
        PrdClarifyService service = service(runner);

        PrdClarifyService.TitleSuggestion result =
                service.suggestTitle("SRM", "采购询价", "报价截止前自动提醒供应商");

        assertThat(result.shortTitle()).isEqualTo("自动催报价");
        assertThat(result.title()).isEqualTo("SRM-采购询价-自动催报价");
    }

    @Test
    void fallsBackToDescriptionWhenAgentFails() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        when(runner.runOnce(anyString(), anyString(), isNull(), eq("claude"), anyList()))
                .thenThrow(new IllegalStateException("agent unavailable"));
        PrdClarifyService service = service(runner);

        PrdClarifyService.TitleSuggestion result =
                service.suggestTitle("ERP", "库存", "支持批量导入安全库存\n补充说明");

        assertThat(result.shortTitle()).isEqualTo("支持批量导入安全库存");
        assertThat(result.title()).isEqualTo("ERP-库存-支持批量导入安全库存");
    }

    @Test
    void fallsBackToDescriptionWhenAgentReturnsFormattingNoise() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        when(runner.runOnce(anyString(), anyString(), isNull(), eq("claude"), anyList()))
                .thenReturn("```markdown\n标题：。\n```");
        PrdClarifyService service = service(runner);

        PrdClarifyService.TitleSuggestion result =
                service.suggestTitle("ERP", "库存", "支持批量导入安全库存");

        assertThat(result.shortTitle()).isEqualTo("支持批量导入安全库存");
        assertThat(result.title()).isEqualTo("ERP-库存-支持批量导入安全库存");
    }

    @Test
    void rejectsBlankProjectBeforeCallingAgent() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        PrdClarifyService service = service(runner);

        assertThatThrownBy(() -> service.suggestTitle(" ", "库存", "支持批量导入安全库存"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("系统不能为空");
        verifyNoInteractions(runner);
    }

    @Test
    void resolvesEachSupportedImageOnlyOnce(@TempDir Path tempDir) throws Exception {
        byte[] imageBytes = new byte[]{1, 2, 3};
        Path image = tempDir.resolve("sample.png");
        Files.write(image, imageBytes);
        ImageAttachmentStorageService storage = mock(ImageAttachmentStorageService.class);
        when(storage.locate("image_1"))
                .thenReturn(new ImageAttachmentStorageService.DownloadFile(image, "image/png", "sample.png"));
        PrdImageInputResolver resolver = new PrdImageInputResolver(storage);

        var result = resolver.resolve("""
                ![图片](/api/prd-clarify/attachments/image/image_1)
                ![重复图片](/api/prd-clarify/attachments/image/image_1)
                """);

        assertThat(result).hasSize(1);
        assertThat(Base64.getDecoder().decode(result.getFirst().base64Data())).containsExactly(imageBytes);
        assertThat(result.getFirst().mimeType()).isEqualTo("image/png");
        verify(storage).locate("image_1");
    }

    @Test
    void skipsUnsupportedImageMime(@TempDir Path tempDir) throws Exception {
        Path image = tempDir.resolve("sample.bmp");
        Files.write(image, new byte[]{1});
        ImageAttachmentStorageService storage = mock(ImageAttachmentStorageService.class);
        when(storage.locate("image_2"))
                .thenReturn(new ImageAttachmentStorageService.DownloadFile(image, "image/bmp", "sample.bmp"));

        var result = new PrdImageInputResolver(storage)
                .resolve("![图片](/api/prd-clarify/attachments/image/image_2)");

        assertThat(result).isEmpty();
    }

    private PrdClarifyService service(AgentOneShotRunner runner) {
        PrdImageInputResolver imageInputResolver =
                new PrdImageInputResolver(mock(ImageAttachmentStorageService.class));
        return new PrdClarifyService(
                runner,
                mock(PrdSessionRepository.class),
                mock(PrdFileStore.class),
                new ObjectMapper(),
                mock(GraphifyQueryService.class),
                mock(DomainKnowledgeQueryService.class),
                imageInputResolver,
                mock(PrdEffortEstimationService.class),
                mock(PrdRequirementSplitService.class),
                mock(PrdProgressEvaluationService.class),
                mock(PrdDocRevisionService.class),
                mock(PrdDevDocumentService.class),
                mock(PrdDevDocumentClarificationService.class),
                mock(PrdDocumentService.class));
    }
}
