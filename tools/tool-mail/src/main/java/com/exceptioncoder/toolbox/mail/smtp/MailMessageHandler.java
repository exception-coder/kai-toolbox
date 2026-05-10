package com.exceptioncoder.toolbox.mail.smtp;

import com.exceptioncoder.toolbox.mail.config.MailProperties;
import com.exceptioncoder.toolbox.mail.domain.MailInbox;
import com.exceptioncoder.toolbox.mail.repository.MailInboxRepository;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
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
 * 仅负责 SMTP 协议交互与白名单准入，MIME 解析委托 {@link MimeMessageParser}。
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
        String normalized = normalizeAddress(from);
        if (!isSenderAllowed(normalized)) {
            log.info("拒绝发件人（不在白名单）: {}", normalized);
            throw new RejectException(550, "Sender not allowed");
        }
        this.fromAddr = normalized;
        log.debug("FROM accepted: {}", normalized);
    }

    @Override
    public void recipient(String to) throws RejectException {
        String normalized = normalizeAddress(to);
        if (!isRecipientDomainAllowed(normalized)) {
            log.info("拒绝收件人（域不在白名单）: {}", normalized);
            throw new RejectException(550, "Recipient domain not allowed");
        }
        toAddrs.add(normalized);
        log.debug("RCPT TO: {}", normalized);
    }

    @Override
    public void data(InputStream stream) throws RejectException, TooMuchDataException, IOException {
        if (toAddrs.isEmpty()) {
            log.warn("收到邮件但无收件人，跳过入库");
            return;
        }

        MimeMessage msg;
        try {
            msg = new MimeMessage(Session.getDefaultInstance(new Properties()), stream);
        } catch (Exception e) {
            // 解析失败返回 451，让对方稍后重投，而不是静默吞掉邮件。
            log.error("MimeMessage 解析失败, from={}, toAddrs={}", fromAddr, toAddrs, e);
            throw new RejectException(451, "Temporary failure parsing message, please retry");
        }

        MimeMessageParser.Parsed parsed = MimeMessageParser.parse(msg);
        String messageId = readMessageId(msg);
        String subject = readSubject(msg);
        long rawSize = readRawSize(msg);
        long now = Instant.now().toEpochMilli();

        try {
            for (String toAddr : toAddrs) {
                MailInbox inbox = MailInbox.builder()
                        .id(UUID.randomUUID().toString())
                        .messageId(messageId)
                        .fromAddr(fromAddr)
                        .toAddr(toAddr)
                        .subject(subject)
                        .bodyText(parsed.bodyText())
                        .bodyHtml(parsed.bodyHtml())
                        .attachments(parsed.attachments())
                        .receivedAt(now)
                        .read(false)
                        .rawSize(rawSize >= 0 ? rawSize : null)
                        .build();
                repo.save(inbox);
                log.info("邮件入库成功: id={}, from={}, to={}, subject={}",
                        inbox.getId(), inbox.getFromAddr(), toAddr, inbox.getSubject());
            }
        } catch (Exception e) {
            log.error("邮件入库失败, from={}, toAddrs={}", fromAddr, toAddrs, e);
            throw new RejectException(451, "Temporary failure storing message, please retry");
        }
    }

    @Override
    public void done() {
        log.debug("SMTP session done, from={}, toCount={}", fromAddr, toAddrs.size());
    }

    /** 信封地址可能带 {@code <addr>} 包裹或前后空白；统一去壳。空字符串保留（SMTP bounce 的 null reverse-path）。 */
    private String normalizeAddress(String raw) {
        if (raw == null) return "";
        String trimmed = raw.trim();
        if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
            trimmed = trimmed.substring(1, trimmed.length() - 1).trim();
        }
        return trimmed;
    }

    /**
     * 收件人域白名单：白名单为空 = 全收；非空时只接受 {@code xxx@<allowed-domain>}。
     * 防御公网暴露 25 端口时被脚本扫描灌库。
     */
    private boolean isRecipientDomainAllowed(String recipient) {
        List<String> whitelist = props.getRecipientDomainWhitelist();
        if (whitelist == null || whitelist.isEmpty()) {
            return true;
        }
        int at = recipient.lastIndexOf('@');
        if (at < 0 || at == recipient.length() - 1) {
            return false;
        }
        String domain = recipient.substring(at + 1).toLowerCase();
        for (String allowed : whitelist) {
            if (allowed != null && domain.equalsIgnoreCase(allowed.trim())) {
                return true;
            }
        }
        return false;
    }

    /**
     * 白名单匹配：含 {@code @} 但以 {@code @} 开头视为域名后缀匹配；
     * 否则视为完整地址精确匹配。例 {@code @amazon.com} 匹配 {@code xxx@amazon.com}。
     */
    private boolean isSenderAllowed(String sender) {
        List<String> whitelist = props.getSenderWhitelist();
        if (whitelist == null || whitelist.isEmpty()) {
            return true;
        }
        String lower = sender.toLowerCase();
        for (String entry : whitelist) {
            String e = entry.toLowerCase().trim();
            if (e.isEmpty()) continue;
            if (e.startsWith("@")) {
                if (lower.endsWith(e)) return true;
            } else if (e.contains("@")) {
                if (lower.equals(e)) return true;
            } else {
                if (lower.contains(e)) return true;
            }
        }
        return false;
    }

    private String readMessageId(MimeMessage msg) {
        try {
            String[] ids = msg.getHeader("Message-ID");
            return (ids != null && ids.length > 0) ? ids[0] : null;
        } catch (Exception e) {
            log.warn("读取 Message-ID 失败", e);
            return null;
        }
    }

    private String readSubject(MimeMessage msg) {
        try {
            return msg.getSubject();
        } catch (Exception e) {
            log.warn("读取邮件主题失败", e);
            return null;
        }
    }

    private long readRawSize(MimeMessage msg) {
        try {
            return msg.getSize();
        } catch (Exception e) {
            return -1;
        }
    }
}
