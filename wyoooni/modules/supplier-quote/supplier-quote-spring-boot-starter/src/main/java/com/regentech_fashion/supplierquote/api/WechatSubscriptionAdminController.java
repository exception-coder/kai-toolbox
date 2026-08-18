package com.regentech_fashion.supplierquote.api;

import com.regentech_fashion.supplierquote.api.dto.WechatSubscriptionDtos.SendSubscriptionRequest;
import com.regentech_fashion.supplierquote.api.dto.WechatSubscriptionDtos.SendSubscriptionResult;
import com.regentech_fashion.supplierquote.api.dto.WechatSubscriptionDtos.SendSubscriptionUserRequest;
import com.regentech_fashion.supplierquote.api.dto.WechatSubscriptionDtos.SubscriptionGrantList;
import com.regentech_fashion.supplierquote.api.dto.WechatSubscriptionDtos.SubscriptionUserList;
import com.regentech_fashion.supplierquote.service.WechatSubscriptionService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 微信一次性订阅通知管理接口。 */
@RestController
@RequestMapping("/api/supplier-quote/admin/subscriptions")
public class WechatSubscriptionAdminController {
    private final WechatSubscriptionService service;

    public WechatSubscriptionAdminController(WechatSubscriptionService service) {
        this.service = service;
    }

    @GetMapping
    public SubscriptionGrantList list() {
        return service.list();
    }

    @GetMapping("/users")
    public SubscriptionUserList users() {
        return service.listUsers();
    }

    @PostMapping("/{grantId}/send")
    public SendSubscriptionResult send(@PathVariable long grantId,
                                       @Valid @RequestBody SendSubscriptionRequest request) {
        return service.send(grantId, request);
    }

    @PostMapping("/users/{userKey}/send")
    public SendSubscriptionResult sendToUser(@PathVariable long userKey,
                                             @Valid @RequestBody SendSubscriptionUserRequest request) {
        return service.sendToUser(userKey, request);
    }
}
