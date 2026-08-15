package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.domain.DocumentProfile;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdBusinessFields;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PrdSessionLifecycleServiceTest {

    @Test
    void createsClarifyingSessionWithNormalizedInputs() {
        Fixture fixture = fixture();
        when(fixture.repository.findById("parent")).thenReturn(Optional.of(session("parent", "DONE")));
        when(fixture.resolver.resolve("标题", "描述", "gpt-5", "codex", "BUG_FIX", 2))
                .thenReturn(new PrdRequirementTypeResolver.Resolution("BUG_FIX", 2));

        PrdSession result = fixture.service.create(
                "标题", "描述", "ERP", "库存", "gpt-5", "CoDeX", "business",
                "BUG_FIX", 2, 42L, "batch", null, " parent ", DocumentProfile.CLASSIC.name());

        ArgumentCaptor<PrdSession> inserted = ArgumentCaptor.forClass(PrdSession.class);
        verify(fixture.repository).insert(inserted.capture());
        assertThat(result).isSameAs(inserted.getValue());
        assertThat(result.getId()).isNotBlank();
        assertThat(result.getStatus()).isEqualTo("CLARIFYING");
        assertThat(result.getEngine()).isEqualTo("codex");
        assertThat(result.getRole()).isEqualTo("BUSINESS");
        assertThat(result.getClarifyMode()).isEqualTo("batch");
        assertThat(result.getParentId()).isEqualTo("parent");
        assertThat(result.getReqType()).isEqualTo("BUG_FIX");
        assertThat(result.getMaxQuestions()).isEqualTo(2);
    }

    @Test
    void rejectsMissingParentBeforeRequirementResolution() {
        Fixture fixture = fixture();
        when(fixture.repository.findById("missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> fixture.service.create(
                "标题", "描述", "ERP", "库存", "gpt-5", "claude", "PRODUCT",
                null, null, null, null, null, "missing", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("父 PRD 会话不存在: missing");

        verify(fixture.resolver, never()).resolve(
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void savesDraftWithStableDefaults() {
        Fixture fixture = fixture();

        PrdSession result = fixture.service.saveDraft(
                "草稿", null, "ERP", "采购", 7L, null, null);

        verify(fixture.repository).insert(result);
        assertThat(result.getRawInput()).isEmpty();
        assertThat(result.getStatus()).isEqualTo("DRAFT");
        assertThat(result.getRole()).isEqualTo("PRODUCT");
        assertThat(result.getReqType()).isEqualTo(PrdRequirementTypeResolver.NEW_MODULE);
        assertThat(result.getMaxQuestions()).isEqualTo(8);
        assertThat(result.getClarifyMode()).isEqualTo("progressive");
        assertThat(result.getDocumentProfile()).isEqualTo(DocumentProfile.CLASSIC.name());
    }

    @Test
    void updatesDraftAndPreservesExistingDocumentProfile() {
        Fixture fixture = fixture();
        PrdSession existing = session("draft", "DRAFT");
        existing.setDocumentProfile(DocumentProfile.SPEC_DRIVEN.name());
        PrdSession updated = session("draft", "DRAFT");
        when(fixture.repository.findById("draft"))
                .thenReturn(Optional.of(existing), Optional.of(updated));

        PrdSession result = fixture.service.updateDraft(
                "draft", "新标题", null, "ERP", "库存", PrdBusinessFields.empty(), null);

        assertThat(result).isSameAs(updated);
        verify(fixture.repository).updateDraftFields(
                "draft", "新标题", "", "ERP", "库存",
                PrdBusinessFields.empty(), DocumentProfile.SPEC_DRIVEN.name());
    }

    @Test
    void rejectsUpdateWhenSessionIsNotDraft() {
        Fixture fixture = fixture();
        when(fixture.repository.findById("done")).thenReturn(Optional.of(session("done", "DONE")));

        assertThatThrownBy(() -> fixture.service.updateDraft(
                "done", "标题", "描述", "ERP", "库存", null, null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("当前状态 DONE 不是草稿，无法这样保存");
    }

    @Test
    void startsClarificationFromExistingDraft() {
        Fixture fixture = fixture();
        PrdSession existing = session("draft", "DRAFT");
        existing.setDocumentProfile(DocumentProfile.SPEC_DRIVEN.name());
        PrdSession updated = session("draft", "CLARIFYING");
        when(fixture.repository.findById("draft"))
                .thenReturn(Optional.of(existing), Optional.of(updated));
        when(fixture.resolver.resolve("标题", "描述", "gpt-5", "claude", null, null))
                .thenReturn(new PrdRequirementTypeResolver.Resolution("MODULE_ADJUST", 4));

        PrdSession result = fixture.service.startClarifyFromDraft(
                "draft", "标题", "描述", "ERP", "库存", "gpt-5", null, "other",
                null, null, "invalid", PrdBusinessFields.empty(), null);

        assertThat(result).isSameAs(updated);
        verify(fixture.repository).startClarifyFromDraft(
                "draft", "标题", "描述", "ERP", "库存", "gpt-5", "claude", "PRODUCT",
                "MODULE_ADJUST", 4, "progressive", PrdBusinessFields.empty(), DocumentProfile.SPEC_DRIVEN.name());
    }

    @Test
    void deletesDatabaseRecordBeforeCanonicalFile() throws Exception {
        Fixture fixture = fixture();

        fixture.service.delete("session");

        InOrder order = inOrder(fixture.repository, fixture.fileStore);
        order.verify(fixture.repository).delete("session");
        order.verify(fixture.fileStore).delete("session");
    }

    @Test
    void compatibilityFacadeDelegatesSessionLifecycle() throws Exception {
        PrdSessionLifecycleService lifecycle = mock(PrdSessionLifecycleService.class);
        PrdSession expected = session("session", "DRAFT");
        when(lifecycle.saveDraft(
                "标题", "描述", "ERP", "库存", 42L, PrdBusinessFields.empty(), null))
                .thenReturn(expected);
        PrdClarifyService facade = facade(lifecycle);

        assertThat(facade.saveDraft(
                "标题", "描述", "ERP", "库存", 42L, PrdBusinessFields.empty(), null))
                .isSameAs(expected);
        facade.delete("session");

        verify(lifecycle).saveDraft(
                "标题", "描述", "ERP", "库存", 42L, PrdBusinessFields.empty(), null);
        verify(lifecycle).delete("session");
    }

    private static Fixture fixture() {
        PrdSessionRepository repository = mock(PrdSessionRepository.class);
        PrdFileStore fileStore = mock(PrdFileStore.class);
        PrdRequirementTypeResolver resolver = mock(PrdRequirementTypeResolver.class);
        return new Fixture(
                repository,
                fileStore,
                resolver,
                new PrdSessionLifecycleService(repository, fileStore, resolver));
    }

    private static PrdClarifyService facade(PrdSessionLifecycleService lifecycle) {
        return new PrdClarifyService(
                mock(AgentOneShotRunner.class),
                mock(PrdSessionRepository.class),
                new ObjectMapper(),
                mock(GraphifyQueryService.class),
                mock(DomainKnowledgeQueryService.class),
                mock(PrdImageInputResolver.class),
                mock(PrdEffortEstimationService.class),
                mock(PrdRequirementSplitService.class),
                mock(PrdProgressEvaluationService.class),
                mock(PrdDocRevisionService.class),
                mock(PrdDevDocumentService.class),
                mock(PrdDevDocumentClarificationService.class),
                mock(PrdDocumentService.class),
                lifecycle);
    }

    private static PrdSession session(String id, String status) {
        return PrdSession.builder().id(id).status(status).build();
    }

    private record Fixture(
            PrdSessionRepository repository,
            PrdFileStore fileStore,
            PrdRequirementTypeResolver resolver,
            PrdSessionLifecycleService service
    ) {
    }
}
