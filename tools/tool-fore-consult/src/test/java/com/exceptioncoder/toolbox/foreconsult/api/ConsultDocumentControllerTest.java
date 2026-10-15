package com.exceptioncoder.toolbox.foreconsult.api;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.repository.*;
import com.exceptioncoder.toolbox.foreconsult.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConsultDocumentControllerTest {
    final ConsultDocumentService documents = mock(ConsultDocumentService.class);
    final ConsultResourceAccess access = new ConsultResourceAccess();
    final ConsultSessionRepository sessions = mock(ConsultSessionRepository.class);
    final ConsultService service = new ConsultService(sessions, mock(ConsultTurnRepository.class),
            mock(ConsultFeedbackRepository.class), mock(ConsultTurnExtractionRepository.class),
            mock(BusinessConsultModelPolicyService.class));
    final ConsultDocumentController controller = new ConsultDocumentController(documents, access, service);

    @AfterEach void clear() { AuthContext.clear(); }

    @Test void generationRequiresExactRuntimeSignature() throws Exception {
        var content = new ObjectMapper().readTree("{\"format\":\"xlsx\"}");
        for (String token : new String[] {null, "", access.issue("another-runtime")}) {
            assertThatThrownBy(() -> controller.create("runtime-a", content, token)).hasMessageContaining("签名无效");
        }
        verifyNoInteractions(documents);
        controller.create("runtime-a", content, access.issue("runtime-a"));
        verify(documents).create("runtime-a", content);
    }

    @Test void otherUsersCannotListOrDownloadEvenWithKnownFileId() {
        authenticate(7L, "USER");
        when(sessions.findById("other")).thenReturn(Optional.of(ConsultSession.builder()
                .sessionId("other").userId("8").build()));
        assertThatThrownBy(() -> controller.list("other")).hasMessageContaining("404");
        assertThatThrownBy(() -> controller.download("other", "a".repeat(64))).hasMessageContaining("404");
        assertThatThrownBy(() -> controller.preview("other", "a".repeat(64), 1)).hasMessageContaining("404");
        verifyNoInteractions(documents);
    }

    @Test void previewRequiresRuntimeSignatureAndOwnerAccess() throws Exception {
        String id = "a".repeat(64);
        assertThatThrownBy(() -> controller.previewForAgent("runtime-a", id, 1, access.issue("other")))
                .hasMessageContaining("签名无效");
        verifyNoInteractions(documents);
        controller.previewForAgent("runtime-a", id, 1, access.issue("runtime-a"));
        verify(documents).previewForRuntime("runtime-a", id, 1);
        authenticate(7L, "USER");
        when(sessions.findById("own")).thenReturn(Optional.of(ConsultSession.builder().sessionId("own").userId("7").build()));
        assertThat(controller.preview("own", id, 1).getHeaders().getCacheControl()).isEqualTo("no-store");
        verify(documents).preview("own", id, 1);
    }

    @Test void ownerDownloadsAttachmentWithNoCacheAndOfficeContentType() throws Exception {
        authenticate(7L, "USER");
        when(sessions.findById("own")).thenReturn(Optional.of(ConsultSession.builder()
                .sessionId("own").userId("7").build()));
        String id = "a".repeat(64);
        var file = new ConsultDocumentService.Document(id, "own", "业务确认表.xlsx", "xlsx", 2, 1, "path", "url");
        when(documents.download("own", id)).thenReturn(new ConsultDocumentService.Download(file, new byte[] {1, 2}));
        var response = controller.download("own", id);
        assertThat(response.getHeaders().getContentType().toString()).contains("spreadsheetml.sheet");
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
        assertThat(response.getHeaders().getFirst("Content-Disposition")).contains("attachment", "filename*=");
        assertThat(response.getBody()).containsExactly(1, 2);
    }

    private void authenticate(long userId, String role) {
        AuthContext.set(new AuthPrincipal(userId, "user", List.of(role), List.of(), "test", Long.MAX_VALUE));
    }
}
