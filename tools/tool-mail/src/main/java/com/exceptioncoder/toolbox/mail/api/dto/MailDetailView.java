package com.exceptioncoder.toolbox.mail.api.dto;

import com.exceptioncoder.toolbox.mail.domain.MailAttachment;
import com.exceptioncoder.toolbox.mail.domain.MailInbox;

import java.util.List;

public record MailDetailView(
        String id,
        String messageId,
        String fromAddr,
        String toAddr,
        String subject,
        String bodyText,
        String bodyHtml,
        List<MailAttachment> attachments,
        long receivedAt,
        boolean read,
        Long rawSize
) {
    public static MailDetailView from(MailInbox m) {
        return new MailDetailView(
                m.getId(),
                m.getMessageId(),
                m.getFromAddr(),
                m.getToAddr(),
                m.getSubject(),
                m.getBodyText(),
                m.getBodyHtml(),
                m.getAttachments(),
                m.getReceivedAt(),
                m.isRead(),
                m.getRawSize()
        );
    }
}
