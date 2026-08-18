package com.regentech_fashion.supplierquote.service;

import com.regentech_fashion.supplierquote.api.SupplierQuoteApiException;
import com.regentech_fashion.supplierquote.api.dto.WechatSubscriptionDtos.SendSubscriptionRequest;
import com.regentech_fashion.supplierquote.api.dto.WechatSubscriptionDtos.SendSubscriptionResult;
import com.regentech_fashion.supplierquote.api.dto.WechatSubscriptionDtos.SendSubscriptionUserRequest;
import com.regentech_fashion.supplierquote.api.dto.WechatSubscriptionDtos.SubscriptionGrantList;
import com.regentech_fashion.supplierquote.api.dto.WechatSubscriptionDtos.SubscriptionGrantView;
import com.regentech_fashion.supplierquote.api.dto.WechatSubscriptionDtos.SubscriptionUserList;
import com.regentech_fashion.supplierquote.api.dto.WechatSubscriptionDtos.SubscriptionUserView;
import com.regentech_fashion.supplierquote.config.SupplierQuoteProperties;
import com.regentech_fashion.supplierquote.domain.WechatSubscriptionClient;
import com.regentech_fashion.supplierquote.spi.SupplierQuoteStore;
import org.springframework.http.HttpStatus;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;

/** 管理一次性订阅机会并执行报价通知推送。 */
public class WechatSubscriptionService {
    private final SupplierQuoteStore store;
    private final WechatSubscriptionClient client;
    private final SupplierQuoteProperties properties;

    public WechatSubscriptionService(SupplierQuoteStore store, WechatSubscriptionClient client,
                                     SupplierQuoteProperties properties) {
        this.store = store;
        this.client = client;
        this.properties = properties;
    }

    public SubscriptionGrantList list() {
        List<SubscriptionGrantView> items = store.findSubscriptionGrants().stream()
                .map(row -> new SubscriptionGrantView(row.id(), row.status(), accountLabel(row.accountId(), row.displayName()),
                        row.supplierName(), row.createdAt(), row.sentAt(), row.resultCode(), row.resultMessage(),
                        row.attemptCount(), row.accountId() != null && !row.accountId().isBlank()))
                .toList();
        return new SubscriptionGrantList(items, items.stream()
                .filter(SubscriptionGrantView::bound)
                .filter(item -> "AVAILABLE".equals(item.status()) || "FAILED".equals(item.status())).count());
    }

    public SubscriptionUserList listUsers() {
        Map<String, List<SupplierQuoteStore.SubscriptionGrantRecord>> grouped = new LinkedHashMap<>();
        for (var grant : store.findSubscriptionGrants()) {
            grouped.computeIfAbsent(grant.subjectHash(), ignored -> new java.util.ArrayList<>()).add(grant);
        }
        List<SubscriptionUserView> items = grouped.values().stream().map(this::toUserView)
                .sorted(java.util.Comparator.comparingLong(SubscriptionUserView::latestCreatedAt).reversed())
                .toList();
        return new SubscriptionUserList(items,
                items.stream().mapToLong(SubscriptionUserView::availableCount).sum(),
                items.stream().mapToLong(SubscriptionUserView::totalCount).sum());
    }

    public SendSubscriptionResult send(long grantId, SendSubscriptionRequest request) {
        var grant = store.findSubscriptionGrants().stream().filter(item -> item.id() == grantId).findFirst()
                .orElseThrow(() -> new SupplierQuoteApiException(HttpStatus.NOT_FOUND,
                        "SUBSCRIPTION_GRANT_NOT_FOUND", "订阅机会不存在"));
        if (grant.accountId() == null || grant.accountId().isBlank()) {
            throw new SupplierQuoteApiException(HttpStatus.CONFLICT, "SUBSCRIPTION_ACCOUNT_NOT_BOUND",
                    "该微信用户尚未关联公司业务账号，完成关联后才能推送");
        }
        String title = defaultIfBlank(request.title(), properties.getWechat().getSubscriptionTitle());
        String content = defaultIfBlank(request.content(), properties.getWechat().getSubscriptionContent());
        String targetUrl = publicBaseUrl() + "/showcase/supplier-quote/q/"
                + URLEncoder.encode(request.quoteTicket(), StandardCharsets.UTF_8);
        return sendGrant(grant, title, content, targetUrl);
    }

    public SendSubscriptionResult sendToUser(long userKey, SendSubscriptionUserRequest request) {
        List<SupplierQuoteStore.SubscriptionGrantRecord> grants = store.findSubscriptionGrants();
        var representative = grants.stream().filter(item -> item.id() == userKey).findFirst()
                .orElseThrow(() -> new SupplierQuoteApiException(HttpStatus.NOT_FOUND,
                        "SUBSCRIPTION_USER_NOT_FOUND", "订阅用户不存在"));
        var grant = grants.stream()
                .filter(item -> item.subjectHash().equals(representative.subjectHash()))
                .filter(item -> isAvailable(item.status()))
                .min(java.util.Comparator.comparingLong(SupplierQuoteStore.SubscriptionGrantRecord::createdAt))
                .orElseThrow(() -> new SupplierQuoteApiException(HttpStatus.CONFLICT,
                        "SUBSCRIPTION_GRANT_EXHAUSTED", "该用户当前没有剩余可推送次数"));
        requireBound(grant);
        String title = defaultIfBlank(request.title(), properties.getWechat().getSubscriptionTitle());
        String content = defaultIfBlank(request.content(), properties.getWechat().getSubscriptionContent());
        String targetUrl = publicBaseUrl() + "/showcase/supplier-quote/market-quotes";
        return sendGrant(grant, title, content, targetUrl);
    }

    private SendSubscriptionResult sendGrant(SupplierQuoteStore.SubscriptionGrantRecord grant, String title,
                                             String content, String targetUrl) {
        long grantId = grant.id();
        long now = System.currentTimeMillis();
        if (!store.claimSubscriptionGrant(grantId, now)) {
            throw new SupplierQuoteApiException(HttpStatus.CONFLICT, "SUBSCRIPTION_GRANT_ALREADY_USED",
                    "该订阅机会已使用或正在发送，请刷新后查看");
        }
        try {
            var result = client.send(grant.openid(), grant.templateId(), grant.scene(), title, content, targetUrl);
            store.completeSubscriptionGrant(grantId, result.successful(), result.code(), result.message(),
                    System.currentTimeMillis());
            return new SendSubscriptionResult(grantId, result.successful() ? "SENT" : "FAILED",
                    result.code(), result.message());
        } catch (RuntimeException exception) {
            store.completeSubscriptionGrant(grantId, false, "NETWORK_ERROR", "微信接口调用结果未知",
                    System.currentTimeMillis());
            throw exception;
        }
    }

    private SubscriptionUserView toUserView(List<SupplierQuoteStore.SubscriptionGrantRecord> grants) {
        var latest = grants.stream().max(java.util.Comparator.comparingLong(
                        SupplierQuoteStore.SubscriptionGrantRecord::createdAt)).orElseThrow();
        long availableCount = grants.stream().filter(item -> isAvailable(item.status())).count();
        boolean bound = latest.accountId() != null && !latest.accountId().isBlank();
        return new SubscriptionUserView(latest.id(), accountLabel(latest.accountId(), latest.displayName()),
                latest.supplierName(), bound ? availableCount : 0, grants.size(), latest.createdAt(),
                latest.resultCode(), latest.resultMessage(), bound);
    }

    private static void requireBound(SupplierQuoteStore.SubscriptionGrantRecord grant) {
        if (grant.accountId() == null || grant.accountId().isBlank()) {
            throw new SupplierQuoteApiException(HttpStatus.CONFLICT, "SUBSCRIPTION_ACCOUNT_NOT_BOUND",
                    "该微信用户尚未关联公司业务账号，完成关联后才能推送");
        }
    }

    private static boolean isAvailable(String status) {
        return "AVAILABLE".equals(status) || "FAILED".equals(status);
    }

    private String publicBaseUrl() {
        String value = properties.getWechat().getPublicBaseUrl();
        if (value == null || value.isBlank()) {
            throw new SupplierQuoteApiException(HttpStatus.SERVICE_UNAVAILABLE, "PUBLIC_BASE_URL_NOT_CONFIGURED",
                    "报价公网域名尚未配置");
        }
        return value.replaceAll("/+$", "");
    }

    private static String accountLabel(String accountId, String displayName) {
        if (displayName != null && !displayName.isBlank()) return displayName;
        if (accountId == null || accountId.isBlank()) return "尚未绑定业务账号";
        return accountId.length() <= 3 ? "***" : accountId.substring(0, 2) + "***" + accountId.charAt(accountId.length() - 1);
    }

    private static String defaultIfBlank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
