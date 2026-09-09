package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.CapsuleRelayIdentityService;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import java.util.regex.Pattern;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

/** 严格限定胶囊 REST 能力，复用已有所有权校验及存储协议。 */
@RestController
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class CapsuleRelayController {
    public static final String PREFIX = "/api/session-client/v1/relay/capsule";
    private static final Pattern ROUTE = Pattern.compile("/api/assistant/(?:feedback-sessions|conversations)(?:/[A-Za-z0-9_-]+)*|/api/claude-chat/sessions/([A-Za-z0-9_-]+)/attachments");
    private final CapsuleRelayIdentityService identities;
    private final ClaudeChatSessionAccessPolicy access;

    public CapsuleRelayController(CapsuleRelayIdentityService identities, ClaudeChatSessionAccessPolicy access) {
        this.identities = identities;
        this.access = access;
    }

    @RequestMapping(value = PREFIX + "/api/**", method = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PATCH})
    public void forward(HttpServletRequest request, HttpServletResponse response) throws Exception {
        String target = request.getRequestURI().substring(PREFIX.length());
        var route = ROUTE.matcher(target);
        if (!route.matches()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        var identity = identities.authenticate(request.getHeader("Authorization"),
                Long.parseLong(request.getHeader("X-Forge-Participant-Id")));
        var previous = AuthContext.current().orElse(null);
        AuthContext.set(identity.principal());
        try {
            if (route.group(1) != null && !access.canAccessCurrentUser(route.group(1))) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN);
            }
            request.getRequestDispatcher(target).forward(request, response);
        } finally {
            if (previous == null) AuthContext.clear(); else AuthContext.set(previous);
        }
    }
}
