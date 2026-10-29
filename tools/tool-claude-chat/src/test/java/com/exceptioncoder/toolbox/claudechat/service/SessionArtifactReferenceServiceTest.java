package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SessionArtifactReferenceServiceTest {
    @TempDir Path root;
    private ClaudeChatSession session(String id) {
        return ClaudeChatSession.builder().id(id).cwd(root.resolve("primary").toString()).sdkSessionId("native").build();
    }
    private MessagePage assistant(String text) {
        return new MessagePage(List.of(ChatMessageView.assistant("reply", text, 1L)), null, false);
    }
    @Test void exactAssistantImageSurvivesCrossProjectPathButNotSiblingOrOtherSession() {
        var history = mock(SessionHistoryService.class);
        when(history.readCursorMessages(anyString(), anyString(), isNull(), isNull(), isNull(), eq(100))).thenReturn(MessagePage.empty());
        var service = new SessionArtifactReferenceService(history, path -> true, new ObjectMapper());
        Path image = root.resolve("external/.run/phone.png");
        service.remember(session("a"), assistant("![验收](" + image + ")"));
        assertEquals(image, service.resolve(session("a"), image.toString()));
        verifyNoInteractions(history);
        assertThrows(IllegalArgumentException.class, () -> service.resolve(session("b"), image.toString()));
        assertThrows(IllegalArgumentException.class, () -> service.resolve(session("a"), image.resolveSibling("secret.png").toString()));
    }
    @Test void liveFallbackUsesRecentPageAndPreservesLiteralPlusAndSpaces() {
        var history = mock(SessionHistoryService.class);
        Path image = root.resolve("external/中文 + 空格.png");
        String encoded = image.toUri().toASCIIString();
        when(history.readCursorMessages(anyString(), eq("native"), isNull(), isNull(), isNull(), eq(100)))
                .thenReturn(assistant("![验收](<" + encoded + ">)"));
        var service = new SessionArtifactReferenceService(history, path -> true, new ObjectMapper());
        assertEquals(image, service.resolve(session("a"), image.toString()));
        assertEquals(image, service.resolve(session("a"), image.toString()));
        verify(history, times(1)).readCursorMessages(anyString(), eq("native"), isNull(), isNull(), isNull(), eq(100));
    }
    @Test void userTextPlainLinksExcludedAndReadonlySessionsCannotAuthorizeImages() {
        var history = mock(SessionHistoryService.class);
        when(history.readCursorMessages(anyString(), anyString(), isNull(), isNull(), isNull(), eq(100))).thenReturn(MessagePage.empty());
        Path image = root.resolve("outside.png");
        var service = new SessionArtifactReferenceService(history, path -> true, new ObjectMapper());
        service.remember(session("a"), new MessagePage(List.of(ChatMessageView.user("user", "![x]("+image+")", 1L)), null, false));
        service.remember(session("a"), assistant("[普通链接]("+image+")"));
        assertThrows(IllegalArgumentException.class, () -> service.resolve(session("a"), image.toString()));
        var excluded = new SessionArtifactReferenceService(history, path -> false, new ObjectMapper());
        excluded.remember(session("a"), assistant("![x]("+image+")"));
        assertThrows(IllegalArgumentException.class, () -> excluded.resolve(session("a"), image.toString()));
        var review = session("review"); review.setExecutionPolicy("review-only");
        service.remember(review, assistant("![x]("+image+")"));
        assertThrows(IllegalArgumentException.class, () -> service.resolve(review, image.toString()));
        assertThrows(IllegalArgumentException.class, () -> service.resolve(session("a"), "../outside.png"));
    }

    @Test void diagramLinksAreExactSessionScopedAndSeparateFromImageReferences() {
        var history = mock(SessionHistoryService.class);
        when(history.readCursorMessages(anyString(), anyString(), isNull(), isNull(), isNull(), eq(100))).thenReturn(MessagePage.empty());
        var service = new SessionArtifactReferenceService(history, path -> true, new ObjectMapper());
        Path diagram = root.resolve("external/中文 + 时序.drawio.xml");
        service.remember(session("a"), assistant("[时序图](<" + diagram.toUri().toASCIIString() + "#L4>)"));
        assertEquals(diagram, service.resolve(session("a"), diagram.toString(), SessionArtifactReferenceService.Kind.DIAGRAM));
        assertThrows(IllegalArgumentException.class, () -> service.resolve(session("a"), diagram.toString()));
        assertThrows(IllegalArgumentException.class, () -> service.resolve(session("b"), diagram.toString(), SessionArtifactReferenceService.Kind.DIAGRAM));
        assertThrows(IllegalArgumentException.class, () -> service.resolve(session("a"), diagram.resolveSibling("secret.drawio").toString(), SessionArtifactReferenceService.Kind.DIAGRAM));
    }

    @Test void liveDiagramFallbackUsesBoundNativeHandleAndRejectsUntrustedSources() {
        Path diagram = root.resolve("outside.drawio");
        var history = mock(SessionHistoryService.class);
        when(history.readCursorMessages(anyString(), anyString(), isNull(), isNull(), isNull(), eq(100)))
                .thenReturn(assistant("[图](" + diagram + ":42:7)"));
        var service = new SessionArtifactReferenceService(history, path -> true, new ObjectMapper());
        assertEquals(diagram, service.resolve(session("live"), diagram.toString(), SessionArtifactReferenceService.Kind.DIAGRAM));
        verify(history).readCursorMessages(session("live").getCwd(), "native", null, null, null, 100);
        var excluded = new SessionArtifactReferenceService(history, path -> false, new ObjectMapper());
        assertThrows(IllegalArgumentException.class, () -> excluded.resolve(session("a"), diagram.toString(), SessionArtifactReferenceService.Kind.DIAGRAM));
        var review = session("review"); review.setExecutionPolicy("review-only");
        assertThrows(IllegalArgumentException.class, () -> service.resolve(review, diagram.toString(), SessionArtifactReferenceService.Kind.DIAGRAM));

        var empty = mock(SessionHistoryService.class);
        when(empty.readCursorMessages(anyString(), anyString(), isNull(), isNull(), isNull(), eq(100))).thenReturn(MessagePage.empty());
        var untrusted = new SessionArtifactReferenceService(empty, path -> true, new ObjectMapper());
        untrusted.remember(session("u"), new MessagePage(List.of(ChatMessageView.user("u", "[图](" + diagram + ")", 1L)), null, false));
        untrusted.remember(session("u"), assistant("`" + diagram + "`\n[文档](" + root.resolve("secret.txt") + ")"));
        assertThrows(IllegalArgumentException.class, () -> untrusted.resolve(session("u"), diagram.toString(), SessionArtifactReferenceService.Kind.DIAGRAM));
        assertThrows(IllegalArgumentException.class, () -> untrusted.resolve(session("u"), root.resolve("secret.txt").toString(), SessionArtifactReferenceService.Kind.DIAGRAM));
        assertThrows(IllegalArgumentException.class, () -> service.resolve(session("a"), "../outside.drawio", SessionArtifactReferenceService.Kind.DIAGRAM));
    }
}
