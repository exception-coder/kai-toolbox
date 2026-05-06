package com.exceptioncoder.toolbox.mail.api.dto;

import com.exceptioncoder.toolbox.mail.domain.MailInbox;

public record MailListItemView(
        String id,
        String fromAddr,
        String toAddr,
        String subject,
        long receivedAt,
        boolean read,
        boolean hasAttachment,
        Long rawSize
) {
    public static MailListItemView from(MailInbox m) {
        return new MailListItemView(
                m.getId(),
                m.getFromAddr(),
                m.getToAddr(),
                m.getSubject(),
                m.getReceivedAt(),
                m.isRead(),
                m.getAttachments() != null && !m.getAttachments().isEmpty(),
                m.getRawSize()
        );
    }
}
