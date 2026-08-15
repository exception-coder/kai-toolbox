package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PrdRequirementSplitServiceTest {

    @Test
    void splitParsesValidItemsAndIncludesKnowledgeContext() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        PrdSessionRepository repo = mock(PrdSessionRepository.class);
        GraphifyQueryService graphify = mock(GraphifyQueryService.class);
        DomainKnowledgeQueryService domainKnowledge = mock(DomainKnowledgeQueryService.class);
        when(repo.findById("parent")).thenReturn(Optional.of(parent()));
        when(graphify.query("project-a", "module-a", "大型需求")).thenReturn("代码事实");
        when(domainKnowledge.query("project-a", "大型需求")).thenReturn("业务事实");
        when(runner.runOnce(anyString(), anyString(), eq("gpt-5"), eq("codex"))).thenReturn("""
                ```json
                {"canSplit":true,"reason":"包含独立能力", "items":[
                  {"title":" 子需求一 ","rawInput":" 完整描述一 ","module":" 模块一 "},
                  {"title":"残缺项","rawInput":"","module":""}
                ]}
                ```
                """);
        PrdRequirementSplitService service = service(runner, repo, graphify, domainKnowledge);

        PrdRequirementSplitService.SplitResult result = service.split("parent");

        assertThat(result.canSplit()).isTrue();
        assertThat(result.reason()).isEqualTo("包含独立能力");
        assertThat(result.items()).containsExactly(
                new PrdRequirementSplitService.SplitItem("子需求一", "完整描述一", "模块一"));
        ArgumentCaptor<String> prompt = ArgumentCaptor.forClass(String.class);
        verify(runner).runOnce(anyString(), prompt.capture(), eq("gpt-5"), eq("codex"));
        assertThat(prompt.getValue()).contains("代码事实", "业务事实", "需求描述");
    }

    @Test
    void splitFallsBackToNotSplittableWhenNoValidItemExists() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        PrdSessionRepository repo = mock(PrdSessionRepository.class);
        when(repo.findById("parent")).thenReturn(Optional.of(parent()));
        when(runner.runOnce(anyString(), anyString(), eq("gpt-5"), eq("codex"))).thenReturn(
                "{\"canSplit\":true,\"reason\":\"\",\"items\":[{\"title\":\"\",\"rawInput\":\"x\"}]}"
        );

        PrdRequirementSplitService.SplitResult result = service(
                runner, repo, mock(GraphifyQueryService.class), mock(DomainKnowledgeQueryService.class))
                .split("parent");

        assertThat(result.canSplit()).isFalse();
        assertThat(result.reason()).isEqualTo("拆分结果解析异常，未获得有效子需求");
        assertThat(result.items()).isEmpty();
    }

    @Test
    void splitRejectsMalformedModelOutput() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        PrdSessionRepository repo = mock(PrdSessionRepository.class);
        when(repo.findById("parent")).thenReturn(Optional.of(parent()));
        when(runner.runOnce(anyString(), anyString(), eq("gpt-5"), eq("codex"))).thenReturn("not-json");

        assertThatThrownBy(() -> service(
                runner, repo, mock(GraphifyQueryService.class), mock(DomainKnowledgeQueryService.class))
                .split("parent"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith("需求拆分结果解析失败，请重试:");
    }

    @Test
    void adoptCreatesTrimmedChildrenWithInheritedDefaults() {
        PrdSessionRepository repo = mock(PrdSessionRepository.class);
        when(repo.findById("parent")).thenReturn(Optional.of(parent()));
        PrdRequirementSplitService service = service(
                mock(AgentOneShotRunner.class), repo,
                mock(GraphifyQueryService.class), mock(DomainKnowledgeQueryService.class));

        List<PrdSession> created = service.adopt("parent", List.of(
                new PrdRequirementSplitService.SplitItem(" 子需求一 ", " 描述一 ", ""),
                new PrdRequirementSplitService.SplitItem("子需求二", "描述二", "module-b"),
                new PrdRequirementSplitService.SplitItem("", "无效", null)), 42L);

        assertThat(created).hasSize(2);
        assertThat(created.get(0))
                .extracting(PrdSession::getTitle, PrdSession::getRawInput, PrdSession::getProject,
                        PrdSession::getModule, PrdSession::getParentId, PrdSession::getCreatedByUserId,
                        PrdSession::getRole, PrdSession::getReqType, PrdSession::getClarifyMode,
                        PrdSession::getStatus)
                .containsExactly("子需求一", "描述一", "project-a", "module-a", "parent", 42L,
                        "PRODUCT", PrdRequirementTypeResolver.NEW_MODULE, "progressive", "DRAFT");
        assertThat(created.get(1).getModule()).isEqualTo("module-b");
        assertThat(created).allSatisfy(child -> {
            assertThat(child.getMaxQuestions()).isEqualTo(
                    PrdRequirementTypeResolver.defaultMaxQuestions(PrdRequirementTypeResolver.NEW_MODULE));
            assertThat(child.getDocumentProfile()).isEqualTo("CLASSIC");
            assertThat(child.getCreatedAt()).isEqualTo(child.getUpdatedAt());
        });
        verify(repo).insert(created.get(0));
        verify(repo).insert(created.get(1));
    }

    @Test
    void adoptRejectsSelectionWithoutValidItems() {
        PrdSessionRepository repo = mock(PrdSessionRepository.class);
        when(repo.findById("parent")).thenReturn(Optional.of(parent()));

        assertThatThrownBy(() -> service(
                mock(AgentOneShotRunner.class), repo,
                mock(GraphifyQueryService.class), mock(DomainKnowledgeQueryService.class))
                .adopt("parent", List.of(
                        new PrdRequirementSplitService.SplitItem("", "描述", null)), 42L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("未选择任何有效子需求");
    }

    @Test
    void clarifyFacadeDelegatesSplitOperations() {
        PrdRequirementSplitService splitService = mock(PrdRequirementSplitService.class);
        PrdRequirementSplitService.SplitItem item =
                new PrdRequirementSplitService.SplitItem("子需求", "完整描述", null);
        PrdRequirementSplitService.SplitResult expected =
                new PrdRequirementSplitService.SplitResult(true, "需要拆分", List.of(item));
        PrdSession child = PrdSession.builder().id("child").build();
        when(splitService.split("parent")).thenReturn(expected);
        when(splitService.adopt("parent", List.of(item), 42L)).thenReturn(List.of(child));
        PrdClarifyService facade = new PrdClarifyService(
                mock(AgentOneShotRunner.class), mock(PrdSessionRepository.class), mock(PrdFileStore.class),
                mock(PrdArtifactService.class), new ObjectMapper(), mock(GraphifyQueryService.class),
                mock(DomainKnowledgeQueryService.class), mock(PrdImageInputResolver.class),
                mock(PrdEffortEstimationService.class), splitService, mock(PrdProgressEvaluationService.class));

        assertThat(facade.splitRequirement("parent")).isSameAs(expected);
        assertThat(facade.adoptSplit("parent", List.of(item), 42L)).containsExactly(child);

        verify(splitService).split("parent");
        verify(splitService).adopt("parent", List.of(item), 42L);
    }

    private PrdRequirementSplitService service(AgentOneShotRunner runner,
                                               PrdSessionRepository repo,
                                               GraphifyQueryService graphify,
                                               DomainKnowledgeQueryService domainKnowledge) {
        return new PrdRequirementSplitService(runner, repo, new ObjectMapper(), graphify, domainKnowledge);
    }

    private PrdSession parent() {
        return PrdSession.builder()
                .id("parent")
                .title("大型需求")
                .rawInput("同时建设两个独立能力")
                .project("project-a")
                .module("module-a")
                .model("gpt-5")
                .engine("codex")
                .documentProfile("CLASSIC")
                .build();
    }
}
