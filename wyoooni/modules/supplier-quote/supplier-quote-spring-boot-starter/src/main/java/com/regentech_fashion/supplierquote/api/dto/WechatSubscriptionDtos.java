package com.regentech_fashion.supplierquote.api.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

/** 微信一次性订阅管理接口契约。 */
public final class WechatSubscriptionDtos {
    private WechatSubscriptionDtos() {}

    public record SubscriptionGrantView(long id, String status, String accountLabel, String supplierName,
                                        long createdAt, Long sentAt, String resultCode, String resultMessage,
                                        int attemptCount, boolean bound) {}

    public record SubscriptionGrantList(List<SubscriptionGrantView> items, long availableCount) {}

    public record SubscriptionUserView(long userKey, String accountLabel, String supplierName,
                                       long availableCount, long totalCount, long latestCreatedAt,
                                       String latestResultCode, String latestResultMessage, boolean bound) {}

    public record SubscriptionUserList(List<SubscriptionUserView> items, long availableCount,
                                       long totalCount) {}

    public record SendSubscriptionRequest(@NotBlank String quoteTicket, String title, String content) {}

    public record SendSubscriptionUserRequest(String title, String content) {}

    public record SendSubscriptionResult(long grantId, String status, String resultCode, String resultMessage) {}
}
