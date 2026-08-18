package com.regentech_fashion.supplierquote.domain;

/** 微信公众号一次性订阅消息网关。 */
public interface WechatSubscriptionClient {
    /** 构造用户确认一次性订阅的微信地址。 */
    String authorizationUrl(String reservedState);

    /** 消费一次订阅机会并发送消息。 */
    SendResult send(String openid, String templateId, int scene, String title, String content, String targetUrl);

    /** 微信发送结果。 */
    record SendResult(boolean successful, String code, String message) {}
}
