package com.exceptioncoder.toolbox.mail.smtp;

import com.exceptioncoder.toolbox.mail.config.MailProperties;
import com.exceptioncoder.toolbox.mail.domain.MailAttachment;
import com.exceptioncoder.toolbox.mail.domain.MailInbox;
import com.exceptioncoder.toolbox.mail.repository.MailInboxRepository;
import jakarta.mail.BodyPart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.subethamail.smtp.MessageHandler;
import org.subethamail.smtp.RejectException;
import org.subethamail.smtp.TooMuchDataException;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.UUID;

/**
 * SubEtha SMTP MessageHandler 实现，每个 SMTP 会话一个实例。
 * 负责发件人白名单校验、邮件解析和入库。
 */
public class MailMessageHandler implements MessageHandler {

    private static final Logger log = LoggerFactory.getLogger(MailMessageHandler.class);

    private final MailInboxRepository repo;
    private final MailProperties props;

    private String fromAddr;
    private final List<String> toAddrs = new ArrayList<>();

    public MailMessageHandler(MailInboxRepository repo, MailProperties props) {
        this.repo = repo;
        this.props = props;
    }

    @Override
    public void from(String from) throws RejectException {
        if (!isSenderAllowed(from)) {
            log.info("拒绝发件人（不在白名单）: {}", from);
            throw new RejectException(550, "Sender not allowed");
        }
        this.fromAddr = from;
        log.debug("FROM accepted: {}", from);
    }

    @Override
    public void recipient(String to) throws RejectException {
        toAddrs.add(to);
        log.debug("RCPT TO: {}", to);
    }

    @Override
    public void data(InputStream stream) throws RejectException, TooMuchDataException, IOException {
        if (toAddrs.isEmpty()) {
            log.warn("收到邮件但无收件人，跳过入库");
            return;
        }
        try {
            Session session = Session.getDefaultInstance(new Properties());
            MimeMessage msg = new MimeMessage(session, stream);

            for (String toAddr : toAddrs) {
                MailInbox inbox = buildInbox(msg, toAddr);
                repo.save(inbox);
                log.info("邮件入库成功: id={}, from={}, to={}, subject={}",
                        inbox.getId(), inbox.getFromAddr(), toAddr, inbox.getSubject());
            }
        } catch (Exception e) {
            log.error("邮件解析/入库失败, from={}, toAddrs={}", fromAddr, toAddrs, e);
        }
    }

    @Override
    public void done() {
        log.debug("SMTP session done, from={}, toCount={}", fromAddr, toAddrs.size());
    }

    private boolean isSenderAllowed(String sender) {
        List<String> whitelist = props.getSenderWhitelist();
        if (whitelist.isEmpty()) {
            return true;
        }
        return whitelist.stream().anyMatch(entry ->
                entry.contains("@") ? sender.equalsIgnoreCase(entry) : sender.toLowerCase().contains(entry.toLowerCase()));
    }

    private MailInbox buildInbox(MimeMessage msg, String toAddr) throws Exception {
        String subject = null;
        try {
            subject = msg.getSubject();
        } catch (Exception e) {
            log.warn("读取邮件主题失败", e);
        }

        String messageId = null;
        try {
            String[] ids = msg.getHeader("Message-ID");
            if (ids != null && ids.length > 0) {
                messageId = ids[0];
            }
        } catch (Exception e) {
            log.warn("读取 Message-ID 失败", e);
        }

        StringBuilder bodyText = new StringBuilder();
        StringBuilder bodyHtml = new StringBuilder();
        List<MailAttachment> attachments = new ArrayList<>();

        try {
            extractContent(msg, bodyText, bodyHtml, attachments);
        } catch (Exception e) {
            log.warn("解析邮件内容失败, subject={}", subject, e);
        }

        int rawSize = -1;
        try {
            rawSize = msg.getSize();
        } catch (Exception e) {
            log.warn("获取邮件大小失败", e);
        }

        return MailInbox.builder()
                .id(UUID.randomUUID().toString())
                .messageId(messageId)
                .fromAddr(fromAddr)
                .toAddr(toAddr)
                .subject(subject)
                .bodyText(bodyText.length() > 0 ? bodyText.toString() : null)
                .bodyHtml(bodyHtml.length() > 0 ? bodyHtml.toString() : null)
                .attachments(attachments)
                .receivedAt(Instant.now().toEpochMilli())
                .read(false)
                .rawSize(rawSize >= 0 ? (long) rawSize : null)
                .build();
    }

    /** 递归提取邮件内容：文本正文、HTML 正文、附件元数据。 */
    private void extractContent(Part part, StringBuilder textOut, StringBuilder htmlOut,
                                List<MailAttachment> attachments) throws Exception {
        String contentType = part.getContentType().toLowerCase();

        if (part.getDisposition() != null && part.getDisposition().equalsIgnoreCase(Part.ATTACHMENT)) {
            attachments.add(MailAttachment.builder()
                    .filename(part.getFileName())
                    .mimeType(contentType.split(";")[0].trim())
                    .size(part.getSize())
                    .build());
            return;
        }

        if (contentType.startsWith("text/plain")) {
            textOut.append(part.getContent());
        } else if (contentType.startsWith("text/html")) {
            htmlOut.append(part.getContent());
        } else if (contentType.startsWith("multipart/")) {
            MimeMultipart mp = (MimeMultipart) part.getContent();
            for (int i = 0; i < mp.getCount(); i++) {
                BodyPart bp = mp.getBodyPart(i);
                extractContent(bp, textOut, htmlOut, attachments);
            }
        }
    }
}
