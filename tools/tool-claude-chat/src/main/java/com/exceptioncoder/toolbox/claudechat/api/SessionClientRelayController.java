package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.delegation.SessionDelegationService;
import com.exceptioncoder.toolbox.claudechat.service.delegation.SessionRelayClientAuthenticator;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

/** 业务服务端代表其已认证用户完成一次性邀请配对。 */
@RestController
@RequestMapping("/api/session-client/v1/relay")
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class SessionClientRelayController {

    private final SessionRelayClientAuthenticator authenticator;
    private final SessionDelegationService delegations;

    public SessionClientRelayController(SessionRelayClientAuthenticator authenticator,
                                        SessionDelegationService delegations) {
        this.authenticator = authenticator;
        this.delegations = delegations;
    }

    /** 只向已认证业务服务返回上游访问凭据。 */
    @PostMapping("/invitations/exchange")
    public SessionDelegationService.ExchangedAccess exchange(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestBody RelayExchangeRequest request) {
        String relayClientId = authenticator.authenticate(authorization);
        return delegations.exchangeForRelay(request.subjectUserId(), relayClientId,
                request.invitationCode(), Instant.now());
    }

    /** Relay 配对请求；subject 只能由宿主身份映射器产生。 */
    public record RelayExchangeRequest(long subjectUserId, String invitationCode) {
    }
}
