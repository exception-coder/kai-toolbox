package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.claudechat.service.SessionLocalPathAccessService;
import com.exceptioncoder.toolbox.claudechat.service.SessionProjectDirectoryService;
import com.exceptioncoder.toolbox.claudechat.service.WorkspaceScanService;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SessionImageControllerTest {
    @TempDir Path root;

    @Test void servesRealPngFromProjectGitDirectoryWithImageHeaders() throws Exception {
        Path file = Files.createDirectories(root.resolve(".git")).resolve("中文 截图.png");
        byte[] png = png();
        Files.write(file, png);
        var controller = controller(root, List.of());
        var response = controller.image("session", ".git/中文 截图.png");
        assertEquals(2, ImageIO.read(new ByteArrayInputStream(response.getBody())).getWidth());
        MockMvcBuilders.standaloneSetup(controller).build()
                .perform(get("/api/claude-chat/sessions/session/image").param("path", file.toString()))
                .andExpect(status().isOk()).andExpect(content().contentType("image/png"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(content().bytes(png));
    }

    @Test void retainsSessionProjectAndExcludedPathBoundaries() throws Exception {
        Path primary = Files.createDirectories(root.resolve("primary"));
        Path additional = Files.createDirectories(root.resolve("additional"));
        Path image = additional.resolve("proof.png"); Files.write(image, png());
        var controller = controller(primary, List.of(additional.toString()));
        assertEquals("image/png", controller.image("session", image.toString()).getHeaders().getContentType().toString());
        assertThrows(IllegalArgumentException.class, () -> controller.image("session", "../additional/proof.png"));
        Path outside = root.resolve("outside.png"); Files.write(outside, png());
        assertThrows(IllegalArgumentException.class, () -> controller.image("session", outside.toString()));
        var paths = paths(List.of(additional.toString()));
        org.springframework.test.util.ReflectionTestUtils.setField(paths, "projectAccess",
                (com.exceptioncoder.toolbox.common.project.ProjectAccess) path -> !path.toAbsolutePath().normalize().startsWith(additional));
        assertThrows(IllegalArgumentException.class, () -> new SessionImageController(repository(primary), access(), paths)
                .image("session", image.toString()));
    }

    @Test void rejectsUnauthorizedMissingNonImageAndOversizedFiles() throws Exception {
        var controller = controller(root, List.of());
        assertEquals(403, assertThrows(ResponseStatusException.class, () -> controller.image("other", "proof.png")).getStatusCode().value());
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> controller.image("session", "missing.png")).getStatusCode().value());
        Files.writeString(root.resolve("fake.png"), "<script>not an image</script>");
        assertEquals(415, assertThrows(ResponseStatusException.class, () -> controller.image("session", "fake.png")).getStatusCode().value());
        try (var large = new RandomAccessFile(root.resolve("large.png").toFile(), "rw")) { large.setLength(25L * 1024 * 1024 + 1); }
        assertEquals(413, assertThrows(ResponseStatusException.class, () -> controller.image("session", "large.png")).getStatusCode().value());
    }

    private static byte[] png() throws Exception {
        var output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(2, 1, BufferedImage.TYPE_INT_RGB), "png", output);
        return output.toByteArray();
    }
    private static SessionImageController controller(Path primary, List<String> additional) {
        return new SessionImageController(repository(primary), access(), paths(additional));
    }
    private static ClaudeChatSessionRepository repository(Path primary) {
        var repository = mock(ClaudeChatSessionRepository.class);
        when(repository.findById("session")).thenReturn(Optional.of(ClaudeChatSession.builder().id("session").cwd(primary.toString()).build()));
        return repository;
    }
    private static ClaudeChatSessionAccessPolicy access() {
        var access = mock(ClaudeChatSessionAccessPolicy.class);
        when(access.canAccessCurrentUser("session")).thenReturn(true);
        return access;
    }
    private static SessionLocalPathAccessService paths(List<String> additional) {
        var projects = mock(SessionProjectDirectoryService.class); when(projects.list("session")).thenReturn(additional);
        var workspace = mock(WorkspaceScanService.class); when(workspace.scan()).thenReturn(new WorkspaceListResponse(List.of(), OffsetDateTime.now()));
        return new SessionLocalPathAccessService(projects, workspace);
    }
}
