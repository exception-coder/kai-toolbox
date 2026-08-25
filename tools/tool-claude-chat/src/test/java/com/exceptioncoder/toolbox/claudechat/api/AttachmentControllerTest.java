package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.AttachmentStorageService;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Assistant 附件上传的会话归属边界测试。 */
class AttachmentControllerTest {

    @Test
    void rejectsUploadWhenCurrentUserCannotAccessSession() throws IOException {
        AttachmentStorageService storage = mock(AttachmentStorageService.class);
        ClaudeChatSessionAccessPolicy accessPolicy = mock(ClaudeChatSessionAccessPolicy.class);
        when(accessPolicy.canAccessOrClaimCurrentUser("session-1")).thenReturn(false);
        AttachmentController controller = new AttachmentController(storage, accessPolicy);
        MockMultipartFile file = new MockMultipartFile(
                "file", "screen.png", "image/png", new byte[]{1, 2, 3});

        assertThatThrownBy(() -> controller.upload("session-1", file))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("403 FORBIDDEN");
        verify(storage, never()).store("session-1", file);
    }
}
