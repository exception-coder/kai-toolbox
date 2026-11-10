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

    @Test void sqlReferencesAreExactTypedAndNotGrantedByUserOrReadonlyConversation() {
        var history = mock(SessionHistoryService.class);
        when(history.readCursorMessages(anyString(), anyString(), isNull(), isNull(), isNull(), eq(100))).thenReturn(MessagePage.empty());
        var service = new SessionArtifactReferenceService(history, path -> true, new ObjectMapper());
        Path file = root.resolve("external/.run/授权 + 草稿.sql");
        service.remember(session("a"), assistant("[授权 SQL](<" + file.toUri().toASCIIString() + "#L3>)"));
        assertEquals(file, service.resolve(session("a"), file.toString(), SessionArtifactReferenceService.Kind.SQL));
        assertThrows(IllegalArgumentException.class, () -> service.resolve(session("b"), file.toString(), SessionArtifactReferenceService.Kind.SQL));
        assertThrows(IllegalArgumentException.class, () -> service.resolve(session("a"), file.resolveSibling("other.sql").toString(), SessionArtifactReferenceService.Kind.SQL));
        assertThrows(IllegalArgumentException.class, () -> service.resolve(session("a"), file.toString(), SessionArtifactReferenceService.Kind.MARKDOWN));
        service.remember(session("user"), new MessagePage(List.of(ChatMessageView.user("u", "[SQL](" + file + ")", 1L)), null, false));
        assertThrows(IllegalArgumentException.class, () -> service.resolve(session("user"), file.toString(), SessionArtifactReferenceService.Kind.SQL));
        for (String policy : List.of("review-only", "consult-readonly")) {
            var readonly = session(policy); readonly.setExecutionPolicy(policy);
            service.remember(readonly, assistant("[SQL](" + file + ")"));
            assertThrows(IllegalArgumentException.class, () -> service.resolve(readonly, file.toString(), SessionArtifactReferenceService.Kind.SQL));
        }
        var excluded = new SessionArtifactReferenceService(history, path -> false, new ObjectMapper());
        excluded.remember(session("a"), assistant("[SQL](" + file + ")"));
        assertThrows(IllegalArgumentException.class, () -> excluded.resolve(session("a"), file.toString(), SessionArtifactReferenceService.Kind.SQL));
    }

    @Test void markdownReferencesRemainTypedAndIsolatedEvenWithUriAndFragment() {
        var history = mock(SessionHistoryService.class);
        when(history.readCursorMessages(anyString(), anyString(), isNull(), isNull(), isNull(), eq(100))).thenReturn(MessagePage.empty());
        var service = new SessionArtifactReferenceService(history, path -> true, new ObjectMapper());
        Path markdown = root.resolve("external/接入 + 说明.markdown");
        service.remember(session("a"), assistant("[接入说明](<" + markdown.toUri().toASCIIString() + "#section>)"));
        assertEquals(markdown, service.resolve(session("a"), markdown.toString(), SessionArtifactReferenceService.Kind.MARKDOWN));
        assertThrows(IllegalArgumentException.class, () -> service.resolve(session("b"), markdown.toString(), SessionArtifactReferenceService.Kind.MARKDOWN));
        assertThrows(IllegalArgumentException.class, () -> service.resolve(session("a"), markdown.toString(), SessionArtifactReferenceService.Kind.DIAGRAM));
        assertThrows(IllegalArgumentException.class, () -> service.resolve(session("a"), markdown.toString()));
        service.remember(session("u"), new MessagePage(List.of(ChatMessageView.user("u", "[说明](" + markdown + ")", 1L)), null, false));
        assertThrows(IllegalArgumentException.class, () -> service.resolve(session("u"), markdown.toString(), SessionArtifactReferenceService.Kind.MARKDOWN));
        for (String policy : List.of("review-only", "consult-readonly")) {
            var readonly = session(policy); readonly.setExecutionPolicy(policy);
            service.remember(readonly, assistant("[说明](" + markdown + ")"));
            assertThrows(IllegalArgumentException.class, () -> service.resolve(readonly, markdown.toString(), SessionArtifactReferenceService.Kind.MARKDOWN));
        }
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
    @Test void imagePathsGivenAsLinksOrInlineCodeAreGrantedButOtherFilesAreNot() {
        var history = mock(SessionHistoryService.class);
        when(history.readCursorMessages(anyString(), anyString(), isNull(), isNull(), isNull(), eq(100))).thenReturn(MessagePage.empty());
        var service = new SessionArtifactReferenceService(history, path -> true, new ObjectMapper());
        Path linked = root.resolve("external/原型 图.png");
        Path coded = root.resolve("external/proto.jpg");
        Path notImage = root.resolve("external/secret.txt");
        service.remember(session("a"), assistant("[原型](<" + linked + ">) 另见 `" + coded + "` 和 `" + notImage + "`"));
        assertEquals(linked, service.resolve(session("a"), linked.toString()));
        assertEquals(coded, service.resolve(session("a"), coded.toString()));
        assertThrows(IllegalArgumentException.class, () -> service.resolve(session("a"), notImage.toString()));
        assertThrows(IllegalArgumentException.class, () -> service.resolve(session("b"), coded.toString()));
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
        assertThrows(IllegalArgumentException.class, () -> service.resolve(session("a"), image.toString()));
        // 助手以普通链接给出的图片路径可查看（手机端点击预览）。
        service.remember(session("a"), assistant("[普通链接]("+image+")"));
        assertEquals(image, service.resolve(session("a"), image.toString()));
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
