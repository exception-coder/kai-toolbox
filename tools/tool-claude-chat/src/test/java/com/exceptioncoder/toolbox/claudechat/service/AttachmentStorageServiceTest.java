package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AttachmentStorageServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void loadsImageOnlyFromCurrentSessionAttachmentDirectory() throws Exception {
        ClaudeChatSessionRepository repository = mock(ClaudeChatSessionRepository.class);
        when(repository.findById("review-1")).thenReturn(Optional.of(session(tempDir)));
        ClaudeChatProperties properties = new ClaudeChatProperties();
        properties.setMaxAttachmentBytes(1024);
        AttachmentStorageService service = new AttachmentStorageService(properties, repository);
        Path image = tempDir.resolve(".kai-chat-attachments/review-1/screen.png");
        Files.createDirectories(image.getParent());
        byte[] content = new byte[]{1, 2, 3, 4};
        Files.write(image, content);

        var images = service.loadImages("review-1", List.of(
                new AttachmentStorageService.ImageReference("screen.png", image.toString(), "image/png")));

        assertThat(images).hasSize(1);
        assertThat(images.getFirst().mimeType()).isEqualTo("image/png");
        assertThat(images.getFirst().base64Data()).isEqualTo(Base64.getEncoder().encodeToString(content));
    }

    @Test
    void rejectsPathOutsideCurrentSessionAttachmentDirectory() throws Exception {
        ClaudeChatSessionRepository repository = mock(ClaudeChatSessionRepository.class);
        when(repository.findById("review-1")).thenReturn(Optional.of(session(tempDir)));
        AttachmentStorageService service = new AttachmentStorageService(new ClaudeChatProperties(), repository);
        Path outside = tempDir.resolve("private.png");
        Files.write(outside, new byte[]{1});

        assertThatThrownBy(() -> service.loadImages("review-1", List.of(
                new AttachmentStorageService.ImageReference("private.png", outside.toString(), "image/png"))))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不属于当前评审会话");
    }

    private static ClaudeChatSession session(Path cwd) {
        return ClaudeChatSession.builder().id("review-1").cwd(cwd.toString()).build();
    }
}
