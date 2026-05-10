package com.exceptioncoder.toolbox.mail.smtp;

import com.exceptioncoder.toolbox.mail.domain.MailAttachment;
import jakarta.mail.Part;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * MimeMessage 解析工具：把 SMTP 协议处理与 MIME 解析解耦。
 * 输出 text/html 正文和附件元数据；不落盘附件文件内容。
 */
final class MimeMessageParser {

    private static final Logger log = LoggerFactory.getLogger(MimeMessageParser.class);

    private MimeMessageParser() {}

    record Parsed(String bodyText, String bodyHtml, List<MailAttachment> attachments) {}

    static Parsed parse(MimeMessage msg) {
        StringBuilder textOut = new StringBuilder();
        StringBuilder htmlOut = new StringBuilder();
        List<MailAttachment> attachments = new ArrayList<>();
        try {
            extract(msg, textOut, htmlOut, attachments);
        } catch (Exception e) {
            log.warn("解析邮件 MIME 失败，subject={}", safeSubject(msg), e);
        }
        return new Parsed(
                textOut.length() > 0 ? textOut.toString() : null,
                htmlOut.length() > 0 ? htmlOut.toString() : null,
                attachments);
    }

    private static void extract(Part part, StringBuilder textOut, StringBuilder htmlOut,
                                List<MailAttachment> attachments) throws Exception {
        String contentType = part.getContentType() == null ? "" : part.getContentType().toLowerCase();
        String disposition = part.getDisposition();

        // 显式 attachment 一律按附件记录；inline 但非文本（典型如截图 image/*）也归为附件，避免内容丢失。
        boolean isExplicitAttachment = Part.ATTACHMENT.equalsIgnoreCase(disposition);
        boolean isInlineNonText = Part.INLINE.equalsIgnoreCase(disposition) && !contentType.startsWith("text/");
        if (isExplicitAttachment || isInlineNonText) {
            attachments.add(MailAttachment.builder()
                    .filename(safeFilename(part))
                    .mimeType(stripParams(contentType))
                    .size(part.getSize())
                    .build());
            return;
        }

        if (contentType.startsWith("text/plain")) {
            textOut.append(readText(part));
        } else if (contentType.startsWith("text/html")) {
            htmlOut.append(readText(part));
        } else if (contentType.startsWith("multipart/")) {
            Object content = part.getContent();
            if (content instanceof MimeMultipart mp) {
                for (int i = 0; i < mp.getCount(); i++) {
                    extract(mp.getBodyPart(i), textOut, htmlOut, attachments);
                }
            }
        }
        // 其他类型（application/* 等且无 disposition）忽略——既不是正文也不是声明的附件。
    }

    /** text/* 安全读取：getContent() 在编码异常时可能返回 InputStream，避免直接 toString() 入库乱码。 */
    private static String readText(Part part) throws Exception {
        Object content = part.getContent();
        if (content instanceof String s) {
            return s;
        }
        if (content instanceof InputStream is) {
            try (is) {
                return new String(is.readAllBytes(), StandardCharsets.UTF_8);
            }
        }
        return content == null ? "" : content.toString();
    }

    private static String safeFilename(Part part) {
        try {
            String name = part.getFileName();
            return name != null ? name : "unnamed";
        } catch (Exception e) {
            return "unnamed";
        }
    }

    private static String stripParams(String contentType) {
        int semi = contentType.indexOf(';');
        return (semi < 0 ? contentType : contentType.substring(0, semi)).trim();
    }

    private static String safeSubject(MimeMessage msg) {
        try {
            return msg.getSubject();
        } catch (Exception e) {
            return "<unreadable>";
        }
    }
}
