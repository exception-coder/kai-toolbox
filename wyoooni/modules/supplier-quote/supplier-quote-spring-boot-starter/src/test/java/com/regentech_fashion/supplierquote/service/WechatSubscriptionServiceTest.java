package com.regentech_fashion.supplierquote.service;

import com.regentech_fashion.supplierquote.api.dto.WechatSubscriptionDtos.SendSubscriptionUserRequest;
import com.regentech_fashion.supplierquote.config.SupplierQuoteProperties;
import com.regentech_fashion.supplierquote.domain.WechatSubscriptionClient;
import com.regentech_fashion.supplierquote.spi.SupplierQuoteStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 微信订阅用户聚合与发送回归测试。 */
class WechatSubscriptionServiceTest {
    private final SupplierQuoteStore store = mock(SupplierQuoteStore.class);
    private final WechatSubscriptionClient client = mock(WechatSubscriptionClient.class);
    private WechatSubscriptionService service;

    @BeforeEach
    void setUp() {
        SupplierQuoteProperties properties = new SupplierQuoteProperties();
        properties.getWechat().setPublicBaseUrl("https://quote.example.com/");
        service = new WechatSubscriptionService(store, client, properties);
    }

    @Test
    void groupsGrantsByWechatUserAndReportsRemainingOverTotal() {
        when(store.findSubscriptionGrants()).thenReturn(List.of(
                grant(4, "subject-a", "AVAILABLE", 400),
                grant(3, "subject-a", "SENT", 300),
                grant(2, "subject-a", "FAILED", 200),
                grant(1, "subject-a", "SENT", 100)));

        var result = service.listUsers();

        assertThat(result.items()).hasSize(1);
        assertThat(result.items().getFirst().userKey()).isEqualTo(4);
        assertThat(result.items().getFirst().availableCount()).isEqualTo(2);
        assertThat(result.items().getFirst().totalCount()).isEqualTo(4);
        assertThat(result.availableCount()).isEqualTo(2);
        assertThat(result.totalCount()).isEqualTo(4);
    }

    @Test
    void sendsOldestRemainingGrantToFixedMarketQuoteEntry() {
        when(store.findSubscriptionGrants()).thenReturn(List.of(
                grant(4, "subject-a", "AVAILABLE", 400),
                grant(2, "subject-a", "FAILED", 200)));
        when(store.claimSubscriptionGrant(eq(2L), anyLong())).thenReturn(true);
        when(client.send("openid", "template", 1000, "供应商报价通知", "请报价",
                "https://quote.example.com/showcase/supplier-quote/market-quotes"))
                .thenReturn(new WechatSubscriptionClient.SendResult(true, "0", "ok"));

        var result = service.sendToUser(4, new SendSubscriptionUserRequest(null, "请报价"));

        assertThat(result.grantId()).isEqualTo(2);
        verify(store).claimSubscriptionGrant(eq(2L), anyLong());
        verify(client).send("openid", "template", 1000, "供应商报价通知", "请报价",
                "https://quote.example.com/showcase/supplier-quote/market-quotes");
    }

    private static SupplierQuoteStore.SubscriptionGrantRecord grant(long id, String subjectHash,
                                                                     String status, long createdAt) {
        return new SupplierQuoteStore.SubscriptionGrantRecord(id, subjectHash, "openid", "template", 1000,
                status, createdAt, null, null, null, "account", "huafu", "111002华孚", 0);
    }
}
