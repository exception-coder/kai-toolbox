package com.regentech_fashion.supplierquote.api;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** 提供微信公众号域名归属验证文件。 */
@RestController("supplierQuoteWechatDomainVerificationController")
public class WechatDomainVerificationController {
    private static final String VERIFICATION_CONTENT = "eQMZqv1CWST9uWxh";

    /** 返回微信要求的原始纯文本验证内容。 */
    @GetMapping(value = "/MP_verify_eQMZqv1CWST9uWxh.txt", produces = MediaType.TEXT_PLAIN_VALUE)
    public String verify() {
        return VERIFICATION_CONTENT;
    }
}
