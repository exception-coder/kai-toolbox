package com.exceptioncoder.toolbox.claudechat.service.attachments;

import com.exceptioncoder.toolbox.common.attachment.SessionAttachmentReader;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatAttachmentRepository;
import org.springframework.stereotype.Service;
import java.io.IOException;
import java.io.Reader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.charset.CharacterCodingException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;

/** 只读取附件元数据登记且真实路径位于本会话目录的文本，不执行HTML脚本。 */
@Service
public class SessionAttachmentTextReader implements SessionAttachmentReader {
    private static final Set<String> TEXT_EXTENSIONS = Set.of("html", "htm", "txt", "md", "csv", "tsv", "json", "xml", "log", "sql", "yaml", "yml");
    private final ClaudeChatSessionRepository sessions;
    private final ClaudeChatAttachmentRepository attachments;

    public SessionAttachmentTextReader(ClaudeChatSessionRepository sessions, ClaudeChatAttachmentRepository attachments) {
        this.sessions = sessions; this.attachments = attachments;
    }

    @Override
    public Page read(String sessionId, String requestedPath, long maxBytes, int offset, int maxChars) throws IOException {
        if (requestedPath == null || requestedPath.isBlank() || offset < 0 || maxChars < 1 || maxChars > 50000) {
            throw new IllegalArgumentException("附件路径不能为空，起点须非负，单次读取须为1至50000字符");
        }
        String cwd = sessions.findById(sessionId).orElseThrow(() -> new IllegalArgumentException("会话不存在")).getCwd();
        Path root = Path.of(cwd, ".kai-chat-attachments", sessionId).toAbsolutePath().normalize().toRealPath();
        Path requested = Path.of(requestedPath);
        Path target = (requested.isAbsolute() ? requested : root.resolve(requested)).normalize().toRealPath();
        if (!target.startsWith(root) || !target.getParent().equals(root) || !Files.isRegularFile(target)
                || attachments.findStored(sessionId, target.getFileName().toString()).isEmpty()) {
            throw new IllegalArgumentException("文件不属于当前会话附件");
        }
        long size = Files.size(target);
        if (size > maxBytes) throw new IllegalArgumentException("附件超过管理员配置的读取上限：" + maxBytes / 1024 / 1024 + " MiB，请联系管理员在业务咨询配置中调整");
        String name = target.getFileName().toString();
        String extension = name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        if (!TEXT_EXTENSIONS.contains(extension)) throw new IllegalArgumentException("本工具只分段读取文本与HTML；Office/PDF请使用对应文档解析能力，图片使用图片输入，不能按文本猜测内容");
        try {
            return page(target, size, offset, maxChars, StandardCharsets.UTF_8);
        } catch (CharacterCodingException exception) {
            return page(target, size, offset, maxChars, Charset.forName("GB18030"));
        }
    }

    private Page page(Path target, long size, int offset, int maxChars, Charset charset) throws IOException {
        try (Reader reader = Files.newBufferedReader(target, charset)) {
            long skipped = 0;
            while (skipped < offset) {
                long count = reader.skip(offset - skipped);
                if (count == 0) break;
                skipped += count;
            }
            if (skipped < offset) throw new IllegalArgumentException("读取起点超过附件文本末尾");
            char[] buffer = new char[maxChars + 1];
            int count = 0;
            while (count < buffer.length) {
                int next = reader.read(buffer, count, buffer.length - count);
                if (next < 0) break;
                count += next;
            }
            int returned = Math.min(count, maxChars);
            return new Page(target.getFileName().toString(), size, offset, offset + returned,
                    count <= maxChars, new String(buffer, 0, returned));
        }
    }
}
