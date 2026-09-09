package com.exceptioncoder.forge.sessionrelay.web;

import com.exceptioncoder.forge.sessionrelay.ForgeRelayBinding;
import com.exceptioncoder.forge.sessionrelay.ForgeRelayBindingStore;
import com.exceptioncoder.forge.sessionrelay.ForgeRelayParticipantResolver;
import com.exceptioncoder.forge.sessionrelay.support.ForgeRelayUpstreamClient;
import com.exceptioncoder.forge.sessionrelay.support.LocalConnectionTicketStore;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

/** 为业务前端提供同源、受宿主身份保护的 Session Client REST 门面。 */
@RestController
@RequestMapping("${forge.session-relay.api-path:/api/forge-session-relay/v1}")
public class ForgeSessionRelayController {
    private final ForgeRelayParticipantResolver participants;
    private final ForgeRelayBindingStore bindings;
    private final LocalConnectionTicketStore tickets;
    private final ForgeRelayUpstreamClient upstream;

    public ForgeSessionRelayController(ForgeRelayParticipantResolver participants,
                                       ForgeRelayBindingStore bindings,
                                       LocalConnectionTicketStore tickets,
                                       ForgeRelayUpstreamClient upstream) {
        this.participants = participants;
        this.bindings = bindings;
        this.tickets = tickets;
        this.upstream = upstream;
    }

    @PostMapping("/pair")
    public ResponseEntity<byte[]> pair(@RequestBody PairRequest request, HttpServletRequest servletRequest) {
        long subject = subject(servletRequest);
        ForgeRelayBinding binding = upstream.exchange(subject, request.invitationCode());
        bindings.save(binding);
        return upstream.get(binding, "/session");
    }

    @GetMapping("/session")
    public ResponseEntity<byte[]> session(HttpServletRequest request) {
        return upstream.get(binding(request), "/session");
    }

    @GetMapping("/messages")
    public ResponseEntity<byte[]> messages(@RequestParam(required = false) Integer before,
                                           @RequestParam(defaultValue = "30") int limit,
                                           HttpServletRequest request) {
        String path = "/messages?limit=" + Math.max(1, Math.min(limit, 100));
        if (before != null) path += "&before=" + before;
        return upstream.get(binding(request), path);
    }

    @PostMapping(value = "/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> upload(@RequestPart("file") MultipartFile file,
                                         HttpServletRequest request) throws IOException {
        return upstream.upload(binding(request), file);
    }

    @PostMapping("/connections")
    public LocalConnectionTicketStore.IssuedTicket connection(HttpServletRequest request) {
        if (upstream.isCapsuleMode()) {
            return tickets.issue(new ForgeRelayBinding(subject(request), "", java.time.Instant.now().plusSeconds(3600), "", ""));
        }
        return tickets.issue(binding(request));
    }

    public ResponseEntity<byte[]> capsuleApi(String path, byte[] body, HttpServletRequest request) {
        return upstream.capsuleApi(subject(request), path, request.getMethod(), body, request.getContentType());
    }

    /** 自动装配的同源胶囊历史及草稿接口。 */
    @RequestMapping(value = "/capsule/api/**", method = {
            org.springframework.web.bind.annotation.RequestMethod.GET,
            org.springframework.web.bind.annotation.RequestMethod.PATCH})
    public ResponseEntity<byte[]> capsuleRequest(@RequestBody(required = false) byte[] body,
            HttpServletRequest request) {
        return capsuleApi(capsulePath(request), body, request);
    }

    /** 附件沿用宿主身份，经服务端上传到所属会话。 */
    @PostMapping(value = "/capsule/api/claude-chat/sessions/{sessionId}/attachments",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> capsuleAttachment(@RequestPart("file") MultipartFile file,
            HttpServletRequest request) throws IOException {
        return capsuleUpload(capsulePath(request), file, request);
    }

    private String capsulePath(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String path = uri.substring(uri.indexOf("/capsule/api/") + "/capsule".length());
        return request.getQueryString() == null ? path : path + "?" + request.getQueryString();
    }

    public ResponseEntity<byte[]> capsuleUpload(String path, MultipartFile file, HttpServletRequest request) throws IOException {
        return upstream.capsuleUpload(subject(request), path, file);
    }

    private ForgeRelayBinding binding(HttpServletRequest request) {
        long subject = subject(request);
        return bindings.find(subject).orElseThrow(() -> new RelayAccessException("当前用户尚未绑定 Forge 会话"));
    }

    private long subject(HttpServletRequest request) {
        HttpHeaders headers = new HttpHeaders();
        request.getHeaderNames().asIterator().forEachRemaining(name ->
                headers.addAll(name, java.util.Collections.list(request.getHeaders(name))));
        long subject = participants.resolve(request.getUserPrincipal(), headers);
        if (subject <= 0) throw new RelayAccessException("业务用户身份无法映射到 Forge");
        return subject;
    }

    public record PairRequest(String invitationCode) { }
}
