package com.exceptioncoder.toolbox.mail.api.dto;

import java.util.List;

public record MailListResponse(
        List<MailListItemView> items,
        long total,
        int page,
        int size,
        long unreadCount
) {}
