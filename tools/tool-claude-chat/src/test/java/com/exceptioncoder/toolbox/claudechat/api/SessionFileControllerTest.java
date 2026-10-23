package com.exceptioncoder.toolbox.claudechat.api;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.service.SessionLocalPathAccessService;
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
        var restricted = new SessionFileController(repository(primary), service);
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
        return new SessionFileController(repository(directory), access(additional));
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
