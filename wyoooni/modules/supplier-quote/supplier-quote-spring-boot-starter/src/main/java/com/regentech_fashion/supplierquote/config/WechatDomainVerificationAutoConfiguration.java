package com.regentech_fashion.supplierquote.config;

import com.regentech_fashion.supplierquote.api.WechatDomainVerificationController;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Import;

/** 独立装配微信公众号域名验证端点。 */
@AutoConfiguration
@Import(WechatDomainVerificationController.class)
public class WechatDomainVerificationAutoConfiguration {
}
