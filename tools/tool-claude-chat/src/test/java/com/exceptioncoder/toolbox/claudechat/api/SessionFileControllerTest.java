package com.exceptioncoder.toolbox.claudechat.api;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.service.SessionLocalPathAccessService;
import com.exceptioncoder.toolbox.claudechat.service.SessionArtifactReferenceService;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.claudechat.service.SessionHistoryService;
import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.exceptioncoder.toolbox.claudechat.service.SessionProjectDirectoryService;
import com.exceptioncoder.toolbox.claudechat.service.WorkspaceScanService;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.*;

class SessionFileControllerTest {

    @Test
    void readsCompleteDiagramAboveTextPreviewLimit(@TempDir Path directory) throws IOException {
        var controller = controller(directory, List.of());
        String text = "<mxGraphModel><!--" + " ".repeat(600 * 1024) + "--><root/></mxGraphModel>";
        Path file = directory.resolve("架构.drawio");
        Files.writeString(file, text);
        var result = controller.diagram("session", "架构.drawio#L2");
        assertEquals(text, result.content());
        assertFalse(result.truncated());
        assertFalse(result.binary());
        assertEquals(text, controller.diagram("session", file.toString()).content());
    }

    @Test
    void reusesSessionAdditionalDirectoryAndRejectsTraversalAndExclusion(@TempDir Path directory) throws IOException {
        Path primary = Files.createDirectories(directory.resolve("primary"));
        Path additional = Files.createDirectories(directory.resolve("additional"));
        Path file = additional.resolve("图.drawio.xml");
        Files.writeString(file, "<mxGraphModel><root/></mxGraphModel>");
        var controller = controller(primary, List.of(additional.toString()));
        assertEquals("图.drawio.xml", controller.diagram("session", file.toString()).name());
        assertThrows(IllegalArgumentException.class, () -> controller.diagram("session", "../additional/图.drawio.xml"));
        Path outside = directory.resolve("外部.drawio");
        Files.writeString(outside, "<mxGraphModel/>");
        assertThrows(IllegalArgumentException.class, () -> controller.diagram("session", outside.toString()));
        assertThrows(IllegalArgumentException.class, () -> controller.diagram("session", "不存在.drawio"));
        var service = access(List.of(additional.toString()));
        com.exceptioncoder.toolbox.common.project.ProjectAccess policy = path -> !path.toAbsolutePath().normalize().startsWith(additional);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "projectAccess", policy);
        var restricted = new SessionFileController(repository(primary), service, references(), sessionAccess());
        assertThrows(IllegalArgumentException.class, () -> restricted.diagram("session", file.toString()));
    }

    @Test
    void rejectsOtherFormatsOversizedAndInvalidUtf8(@TempDir Path directory) throws IOException {
        var controller = controller(directory, List.of());
        Files.writeString(directory.resolve("secret.txt"), "text");
        assertThrows(IllegalArgumentException.class, () -> controller.diagram("session", "secret.txt"));
        Files.write(directory.resolve("损坏.drawio"), new byte[] {(byte) 0xc3, 0x28});
        assertThrows(IllegalArgumentException.class, () -> controller.diagram("session", "损坏.drawio"));
        Files.write(directory.resolve("binary.drawio"), new byte[] {0, 1});
        assertThrows(IllegalArgumentException.class, () -> controller.diagram("session", "binary.drawio"));
        Files.write(directory.resolve("large.drawio"), new byte[5 * 1024 * 1024 + 1]);
        var failure = assertThrows(ResponseStatusException.class, () -> controller.diagram("session", "large.drawio"));
        assertEquals(413, failure.getStatusCode().value());
        assertThrows(ResponseStatusException.class, () -> controller.diagram("missing", "large.drawio"));
    }

    private static SessionFileController controller(Path directory, List<String> additional) {
        return new SessionFileController(repository(directory), access(additional), references(), sessionAccess());
    }

    @Test
    void readsCrossDirectoryDiagramFromVerifiedAssistantReferenceOnly(@TempDir Path directory) throws Exception {
        Path primary = Files.createDirectories(directory.resolve("primary"));
        Path file = directory.resolve("visit-current-sequence.drawio");
        String xml = "<mxGraphModel><root/></mxGraphModel>";
        Files.writeString(file, xml);
        var history = mock(SessionHistoryService.class);
        when(history.readCursorMessages(anyString(), anyString(), isNull(), isNull(), isNull(), eq(100)))
                .thenReturn(MessagePage.empty());
        var references = new SessionArtifactReferenceService(history, path -> true, new ObjectMapper());
        var session = repository(primary).findById("session").orElseThrow();
        references.remember(session, new MessagePage(List.of(ChatMessageView.assistant("reply", "[时序图](" + file + ")", 1L)), null, false));
        var controller = new SessionFileController(repository(primary), access(List.of()), references, sessionAccess());
        assertEquals(xml, controller.diagram("session", file.toString()).content());
        verifyNoInteractions(history);
        Path sibling = directory.resolve("unreferenced.drawio");
        Files.writeString(sibling, xml);
        assertThrows(IllegalArgumentException.class, () -> controller.diagram("session", sibling.toString()));
        var denied = mock(ClaudeChatSessionAccessPolicy.class);
        var unauthorized = new SessionFileController(repository(primary), access(List.of()), references, denied);
        assertEquals(403, assertThrows(ResponseStatusException.class,
                () -> unauthorized.diagram("session", file.toString())).getStatusCode().value());
        Files.delete(file);
        assertThrows(IllegalArgumentException.class, () -> controller.diagram("session", file.toString()));
    }

    private static SessionArtifactReferenceService references() {
        var references = mock(SessionArtifactReferenceService.class);
        when(references.resolve(any(), anyString(), any())).thenThrow(new IllegalArgumentException("no reference"));
        return references;
    }

    @Test
    void readsCompleteMarkdownAndRetainsTypeEncodingAndSizeBoundaries(@TempDir Path directory) throws Exception {
        var controller = controller(directory, List.of());
        String content = "# 中文文档\n" + "内容\n".repeat(100_000);
        Path file = directory.resolve("说明.markdown");
        Files.writeString(file, content);
        var result = controller.markdown("session", "说明.markdown#L2");
        assertEquals(content, result.content());
        assertEquals(file.toString(), result.path());
        assertFalse(result.truncated());
        Files.writeString(directory.resolve("code.mdx"), "export default () => null");
        assertThrows(IllegalArgumentException.class, () -> controller.markdown("session", "code.mdx"));
        assertThrows(IllegalArgumentException.class, () -> controller.markdown("session", "missing.md"));
        Files.write(directory.resolve("binary.md"), new byte[] {0, 1});
        assertThrows(IllegalArgumentException.class, () -> controller.markdown("session", "binary.md"));
        Files.write(directory.resolve("invalid.md"), new byte[] {(byte) 0xc3, 0x28});
        assertThrows(IllegalArgumentException.class, () -> controller.markdown("session", "invalid.md"));
        Files.write(directory.resolve("large.md"), new byte[2 * 1024 * 1024 + 1]);
        assertEquals(413, assertThrows(ResponseStatusException.class,
                () -> controller.markdown("session", "large.md")).getStatusCode().value());
        assertThrows(IllegalArgumentException.class, () -> controller.markdown("session", "../outside.md"));
    }

    @Test
    void readsOnlyTheReferencedExternalMarkdownAndRejectsUnauthorizedOrExcluded(@TempDir Path directory) throws Exception {
        Path primary = Files.createDirectories(directory.resolve("primary"));
        Path file = directory.resolve("integration.md");
        Files.writeString(file, "# 接入设计");
        var session = repository(primary).findById("session").orElseThrow();
        var references = new SessionArtifactReferenceService(mock(SessionHistoryService.class), path -> true, new ObjectMapper());
        references.remember(session, new MessagePage(List.of(ChatMessageView.assistant("reply", "[说明](" + file + ")", 1L)), null, false));
        var controller = new SessionFileController(repository(primary), access(List.of()), references, sessionAccess());
        assertEquals("# 接入设计", controller.markdown("session", file.toString()).content());
        assertThrows(IllegalArgumentException.class, () -> controller.markdown("session", directory.resolve("sibling.md").toString()));
        var unauthorized = new SessionFileController(repository(primary), access(List.of()), references, mock(ClaudeChatSessionAccessPolicy.class));
        assertEquals(403, assertThrows(ResponseStatusException.class, () -> unauthorized.markdown("session", file.toString())).getStatusCode().value());
        var excluded = new SessionArtifactReferenceService(mock(SessionHistoryService.class), path -> false, new ObjectMapper());
        excluded.remember(session, new MessagePage(List.of(ChatMessageView.assistant("reply", "[说明](" + file + ")", 1L)), null, false));
        var restricted = new SessionFileController(repository(primary), access(List.of()), excluded, sessionAccess());
        assertThrows(IllegalArgumentException.class, () -> restricted.markdown("session", file.toString()));
    }

    private static ClaudeChatSessionAccessPolicy sessionAccess() {
        var access = mock(ClaudeChatSessionAccessPolicy.class);
        when(access.canAccessCurrentUser(anyString())).thenReturn(true);
        return access;
    }

    private static ClaudeChatSessionRepository repository(Path directory) {
        var repository = mock(ClaudeChatSessionRepository.class);
        when(repository.findById("session")).thenReturn(Optional.of(ClaudeChatSession.builder().id("session").cwd(directory.toString()).build()));
        return repository;
    }

    private static SessionLocalPathAccessService access(List<String> additional) {
        var projects = mock(SessionProjectDirectoryService.class);
        when(projects.list("session")).thenReturn(additional);
        var workspaces = mock(WorkspaceScanService.class);
        when(workspaces.scan()).thenReturn(new WorkspaceListResponse(List.of(), OffsetDateTime.now()));
        return new SessionLocalPathAccessService(projects, workspaces);
    }

    @Test
    void removesEditorLocationSuffixFromLinkedFilePath() {
        assertEquals("D:/workspace/App.java",
                SessionFileController.normalizeLinkedPath("D:/workspace/App.java:42:7"));
        assertEquals("D:\\workspace\\App.java",
                SessionFileController.normalizeLinkedPath("<D:\\workspace\\App.java#L42>"));
    }

    @Test
    void keepsOrdinaryPathAndRejectsBlankInput() {
        assertEquals("docs/design", SessionFileController.normalizeLinkedPath("docs/design"));
        assertThrows(IllegalArgumentException.class, () -> SessionFileController.normalizeLinkedPath("  "));
    }
}
