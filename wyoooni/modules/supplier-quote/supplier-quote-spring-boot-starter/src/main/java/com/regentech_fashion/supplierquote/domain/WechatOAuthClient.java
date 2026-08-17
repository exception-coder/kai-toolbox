package com.regentech_fashion.supplierquote.domain;

public interface WechatOAuthClient {
    String authorizationUrl(String state);
    String exchangeCode(String code);
    boolean isMock();
    String mockOpenid();
}
