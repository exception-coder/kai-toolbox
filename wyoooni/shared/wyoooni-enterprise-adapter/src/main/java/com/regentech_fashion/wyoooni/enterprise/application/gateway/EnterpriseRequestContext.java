package com.regentech_fashion.wyoooni.enterprise.application.gateway;

/**
 * 调用公司统一业务网关时透传的业务主体上下文。
 *
 * @param accountId 公司业务账号标识
 * @param sourceSystem 账号来源系统
 * @param businessPartyId 公司业务伙伴标识
 */
public record EnterpriseRequestContext(String accountId, String sourceSystem, String businessPartyId) {}
