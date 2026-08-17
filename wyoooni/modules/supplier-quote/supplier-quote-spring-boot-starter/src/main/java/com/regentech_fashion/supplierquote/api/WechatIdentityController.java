package com.regentech_fashion.supplierquote.api;

import com.regentech_fashion.supplierquote.api.dto.SupplierQuoteDtos.WechatSessionView;
import com.regentech_fashion.supplierquote.service.WechatIdentityService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

@RestController
@RequestMapping("/api/supplier-quote/public/wechat")
public class WechatIdentityController {
    private final WechatIdentityService identityService;

    public WechatIdentityController(WechatIdentityService identityService) {
        this.identityService = identityService;
    }

    @GetMapping("/session")
    public ResponseEntity<WechatSessionView> session(
            @CookieValue(name = WechatIdentityService.SESSION_COOKIE, required = false) String sessionToken,
            @RequestParam(required = false) String returnTo,
            HttpServletRequest request,
            HttpServletResponse response) {
        WechatSessionView session = identityService.session(sessionToken, returnTo);
        if (session.authenticated()) {
            return ResponseEntity.ok(session);
        }
        return identityService.beginLocalDevelopmentSession(request.getServerName(), returnTo)
                .map(completed -> completeLocalDevelopmentSession(completed, returnTo, response))
                .orElseGet(() -> ResponseEntity.ok(session));
    }

    @GetMapping("/oauth/authorize")
    public ResponseEntity<Void> authorize(@RequestParam(required = false) String returnTo,
                                          HttpServletResponse response) {
        var start = identityService.beginAuthorization(returnTo);
        if (start.redirectUrl() != null) return redirect(start.redirectUrl());
        var completed = identityService.completeMock(start.state());
        writeSessionCookie(response, completed.rawSessionToken());
        return redirect(completed.returnTo());
    }

    @GetMapping("/oauth/callback")
    public ResponseEntity<Void> callback(@RequestParam String state, @RequestParam String code,
                                         HttpServletResponse response) {
        var completed = identityService.completeOfficial(state, code);
        writeSessionCookie(response, completed.rawSessionToken());
        return redirect(completed.returnTo());
    }

    private void writeSessionCookie(HttpServletResponse response, String token) {
        writeSessionCookie(response, token, identityService.secureCookie());
    }

    private void writeSessionCookie(HttpServletResponse response, String token, boolean secure) {
        ResponseCookie cookie = ResponseCookie.from(WechatIdentityService.SESSION_COOKIE, token)
                .httpOnly(true).secure(secure).sameSite("Lax").path("/")
                .maxAge(identityService.cookieMaxAgeSeconds()).build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private ResponseEntity<WechatSessionView> completeLocalDevelopmentSession(
            WechatIdentityService.CompletedAuthorization completed,
            String returnTo,
            HttpServletResponse response) {
        writeSessionCookie(response, completed.rawSessionToken(), false);
        return ResponseEntity.ok(identityService.session(completed.rawSessionToken(), returnTo));
    }

    private static ResponseEntity<Void> redirect(String location) {
        return ResponseEntity.status(302).location(URI.create(location)).build();
    }
}
