package com.exceptioncoder.toolbox.claudechat.service.attachments;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatAttachmentRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class SessionAttachmentTextReaderTest {
    @TempDir Path temp;

    @Test void readsLargeHtmlByBoundedCharacterOffsetAndRechecksLimit() throws Exception {
        var sessions = mock(ClaudeChatSessionRepository.class);
        var attachments = mock(ClaudeChatAttachmentRepository.class);
        when(sessions.findById("s")).thenReturn(Optional.of(ClaudeChatSession.builder().cwd(temp.toString()).build()));
        Path root = temp.resolve(".kai-chat-attachments/s"); Files.createDirectories(root);
        Path html = root.resolve("report.html");
        Files.writeString(html, "<table>" + "业务数据".repeat(200000) + "</table>");
        when(attachments.findStored("s", "report.html")).thenReturn(Optional.of("att"));
        var reader = new SessionAttachmentTextReader(sessions, attachments);
        var first = reader.read("s", html.toString(), 50L * 1024 * 1024, 0, 123);
        assertThat(first.sizeBytes()).isGreaterThan(2 * 1024 * 1024);
        assertThat(first.text()).hasSize(123); assertThat(first.complete()).isFalse();
        var second = reader.read("s", html.toString(), 50L * 1024 * 1024, first.nextOffset(), 150);
        assertThat(second.offset()).isEqualTo(123); assertThat(second.text()).hasSize(150);
        assertThat(reader.readContent("s", 50L * 1024 * 1024,
                new com.exceptioncoder.toolbox.common.attachment.SessionAttachmentReader.Request(
                        html.toString(), 123, 150, null, null, null))).isEqualTo(second);
        assertThatThrownBy(() -> reader.read("s", html.toString(), 1024, 0, 123)).hasMessageContaining("管理员配置");
        assertThatThrownBy(() -> reader.read("s", html.toString(), 50L * 1024 * 1024, 0, 50001)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test void rejectsOtherSessionTraversalUnknownMetadataAndBinaryFiles() throws Exception {
        var sessions = mock(ClaudeChatSessionRepository.class);
        var attachments = mock(ClaudeChatAttachmentRepository.class);
        when(sessions.findById("s")).thenReturn(Optional.of(ClaudeChatSession.builder().cwd(temp.toString()).build()));
        Path root = temp.resolve(".kai-chat-attachments/s"); Files.createDirectories(root);
        Path other = temp.resolve(".kai-chat-attachments/other/report.html"); Files.createDirectories(other.getParent()); Files.writeString(other, "secret");
        var reader = new SessionAttachmentTextReader(sessions, attachments);
        assertThatThrownBy(() -> reader.read("s", other.toString(), 9999, 0, 10)).hasMessageContaining("不属于");
        assertThatThrownBy(() -> reader.read("s", "../other/report.html", 9999, 0, 10)).hasMessageContaining("不属于");
        Path unknown = root.resolve("unknown.txt"); Files.writeString(unknown, "not uploaded");
        assertThatThrownBy(() -> reader.read("s", unknown.toString(), 9999, 0, 10)).hasMessageContaining("不属于");
        Path binary = root.resolve("data.xlsx"); Files.writeString(binary, "data");
        when(attachments.findStored("s", "data.xlsx")).thenReturn(Optional.of("att"));
        assertThatThrownBy(() -> reader.read("s", binary.toString(), 9999, 0, 10)).hasMessageContaining("按sheet读取");
    }
}
