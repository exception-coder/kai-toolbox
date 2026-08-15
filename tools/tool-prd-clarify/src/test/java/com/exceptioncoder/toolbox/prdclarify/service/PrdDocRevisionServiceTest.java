package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactType;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PrdDocRevisionServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void createCopiesLatestContentAndMetadataIntoRevision() throws Exception {
        Fixture fixture = fixture();
        PrdSession latest = PrdSession.builder()
                .id("revision-v2")
                .questions("latest-questions")
                .build();
        when(fixture.repo.findLatestRevision("parent")).thenReturn(Optional.of(latest));
        when(fixture.repo.nextRevisionNumber("parent")).thenReturn(3);
        when(fixture.fileStore.read("revision-v2")).thenReturn("latest-prd");

        PrdSession revision = fixture.service.create("parent", "新增审计字段");

        assertThat(revision.getTitle()).isEqualTo("订单需求（修订版 v3）");
        assertThat(revision.getRawInput()).isEqualTo("【后台自动修订 — 基于：订单需求】\n新增审计字段");
        assertThat(revision.getQuestions()).isEqualTo("latest-questions");
        assertThat(revision)
                .extracting(PrdSession::getProject, PrdSession::getModule, PrdSession::getStatus,
                        PrdSession::getRole, PrdSession::getReqType, PrdSession::getClarifyMode,
                        PrdSession::getDocumentProfile, PrdSession::getCreatedByUserId,
                        PrdSession::getParentId)
                .containsExactly("kai-toolbox", "PRD", "DONE", "PRODUCT", "NEW_MODULE",
                        "progressive", "CLASSIC", 42L, "parent");
        assertThat(revision.getCreatedAt()).isEqualTo(revision.getUpdatedAt());
        verify(fixture.artifactService).write(revision.getId(), PrdArtifactType.PRD, "latest-prd",
                PrdArtifactService.ArtifactMetadata.empty());

        ArgumentCaptor<String> estimation = ArgumentCaptor.forClass(String.class);
        verify(fixture.repo).updateDevDocEstimation(eq("parent"), estimation.capture());
        assertThat(new ObjectMapper().readTree(estimation.getValue()).path("invalidatedReason").asText())
                .isEqualTo("PRD 已产生新的修订版本");
    }

    @Test
    void recoverPromotesCurrentContentAndRestoresLatestBackup() throws Exception {
        Fixture fixture = fixture();
        Path parentPath = tempDir.resolve("parent.md");
        Files.writeString(tempDir.resolve("parent-v1.md"), "old-v1");
        Files.writeString(tempDir.resolve("parent-v3.md"), "old-v3");
        when(fixture.fileStore.pathFor("parent")).thenReturn(parentPath);
        when(fixture.fileStore.read("parent")).thenReturn("updated-prd");
        when(fixture.repo.findLatestRevision("parent")).thenReturn(Optional.empty());
        when(fixture.repo.nextRevisionNumber("parent")).thenReturn(2);

        PrdSession revision = fixture.service.recoverInPlaceUpdate("parent", "恢复旧链路");

        verify(fixture.artifactService).write(revision.getId(), PrdArtifactType.PRD, "updated-prd",
                PrdArtifactService.ArtifactMetadata.empty());
        verify(fixture.artifactService).write("parent", PrdArtifactType.PRD, "old-v3",
                PrdArtifactService.ArtifactMetadata.empty());
    }

    @Test
    void recoverRejectsMissingBackupBeforeCreatingRevision() throws Exception {
        Fixture fixture = fixture();
        when(fixture.fileStore.pathFor("parent")).thenReturn(tempDir.resolve("parent.md"));

        assertThatThrownBy(() -> fixture.service.recoverInPlaceUpdate("parent", "恢复旧链路"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("检测到旧版 PRD 已原地更新，但找不到更新前备份，无法安全恢复版本树");
        verify(fixture.repo, never()).insert(any());
    }

    @Test
    void recoverReportsRootRestoreFailureAfterRevisionWasSaved() throws Exception {
        Fixture fixture = fixture();
        Path parentPath = tempDir.resolve("parent.md");
        Files.writeString(tempDir.resolve("parent-v1.md"), "old-prd");
        when(fixture.fileStore.pathFor("parent")).thenReturn(parentPath);
        when(fixture.fileStore.read("parent")).thenReturn("updated-prd");
        when(fixture.repo.nextRevisionNumber("parent")).thenReturn(2);
        doThrow(new IOException("disk unavailable")).when(fixture.artifactService)
                .write(eq("parent"), eq(PrdArtifactType.PRD), eq("old-prd"), any());

        assertThatThrownBy(() -> fixture.service.recoverInPlaceUpdate("parent", "恢复旧链路"))
                .isInstanceOf(IOException.class)
                .hasMessage("修订子节点已创建，但根 PRD 从备份还原失败: disk unavailable");
        verify(fixture.repo).insert(any(PrdSession.class));
    }

    @Test
    void clarifyFacadeDelegatesRevisionOperations() throws Exception {
        PrdDocRevisionService revisionService = mock(PrdDocRevisionService.class);
        PrdSession expected = PrdSession.builder().id("revision").build();
        when(revisionService.create("parent", "change")).thenReturn(expected);
        when(revisionService.recoverInPlaceUpdate("parent", "recover")).thenReturn(expected);
        PrdClarifyService facade = new PrdClarifyService(
                mock(AgentOneShotRunner.class), mock(PrdSessionRepository.class), mock(PrdFileStore.class),
                mock(PrdArtifactService.class), new ObjectMapper(), mock(GraphifyQueryService.class),
                mock(DomainKnowledgeQueryService.class), mock(PrdImageInputResolver.class),
                mock(PrdEffortEstimationService.class), mock(PrdRequirementSplitService.class),
                mock(PrdProgressEvaluationService.class), revisionService,
                mock(PrdDevDocumentService.class));

        assertThat(facade.createBackgroundRevision("parent", "change")).isSameAs(expected);
        assertThat(facade.recoverInPlacePrdAsBackgroundRevision("parent", "recover")).isSameAs(expected);

        verify(revisionService).create("parent", "change");
        verify(revisionService).recoverInPlaceUpdate("parent", "recover");
    }

    private Fixture fixture() throws IOException {
        PrdSessionRepository repo = mock(PrdSessionRepository.class);
        PrdFileStore fileStore = mock(PrdFileStore.class);
        PrdArtifactService artifactService = mock(PrdArtifactService.class);
        PrdSession parent = parent();
        AtomicReference<PrdSession> inserted = new AtomicReference<>();
        doAnswer(invocation -> {
            inserted.set(invocation.getArgument(0));
            return null;
        }).when(repo).insert(any(PrdSession.class));
        when(repo.findById(anyString())).thenAnswer(invocation -> {
            String id = invocation.getArgument(0);
            if ("parent".equals(id)) {
                return Optional.of(parent);
            }
            return Optional.ofNullable(inserted.get());
        });
        when(repo.findLatestRevision("parent")).thenReturn(Optional.empty());
        return new Fixture(repo, fileStore, artifactService,
                new PrdDocRevisionService(repo, fileStore, artifactService, new ObjectMapper()));
    }

    private PrdSession parent() {
        return PrdSession.builder()
                .id("parent")
                .title("订单需求")
                .project("kai-toolbox")
                .module("PRD")
                .requirementDetail("需求详情")
                .businessBackground("业务背景")
                .questions("root-questions")
                .role("PRODUCT")
                .reqType("NEW_MODULE")
                .maxQuestions(8)
                .clarifyMode("progressive")
                .model("gpt-5")
                .engine("codex")
                .documentProfile("CLASSIC")
                .createdByUserId(42L)
                .devDocEstimation("{\"hoursMin\":2}")
                .build();
    }

    private record Fixture(PrdSessionRepository repo,
                           PrdFileStore fileStore,
                           PrdArtifactService artifactService,
                           PrdDocRevisionService service) {
    }
}
