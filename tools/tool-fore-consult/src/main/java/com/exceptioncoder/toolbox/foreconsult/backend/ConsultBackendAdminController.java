package com.exceptioncoder.toolbox.foreconsult.backend;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Uses existing administrator authentication; application credentials cannot manage grants. */
@RestController
@RequireRole("ADMIN")
@RequestMapping("/api/fore-consult/backend-clients")
public class ConsultBackendAdminController {
    private final ConsultBackendAuth auth;
    private final ObjectMapper mapper;

    public ConsultBackendAdminController(ConsultBackendAuth auth, ObjectMapper mapper) {
        this.auth = auth; this.mapper = mapper.copy().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
        this.mapper.disable(com.fasterxml.jackson.databind.MapperFeature.ALLOW_COERCION_OF_SCALARS);
        this.mapper.enable(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
    }

    @GetMapping
    public ResponseEntity<ConsultBackendAuth.ManagementView> list(@RequestParam(defaultValue = "") String q) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(auth.management(q));
    }

    @PostMapping
    public ResponseEntity<ConsultBackendAuth.Credential> create(HttpServletRequest request) throws Exception {
        ConsultBackendAuth.GrantRequest grant;
        try { grant = mapper.readValue(ConsultBackendController.read(request), ConsultBackendAuth.GrantRequest.class); }
        catch (ConsultBackendException e) { throw e; }
        catch (Exception e) { throw ConsultBackendException.invalid("授权参数无效"); }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(auth.create(grant, request.getHeader("Idempotency-Key")));
    }

    @PostMapping("/{id}/rotate")
    public ResponseEntity<ConsultBackendAuth.Credential> rotate(@PathVariable String id,
            @RequestBody(required = false) Map<String, Long> renewal) {
        if (renewal != null && (renewal.size() != 1 || renewal.get("expiresAt") == null)) throw ConsultBackendException.invalid("轮换仅接受 expiresAt");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(auth.rotate(id, renewal == null ? null : renewal.get("expiresAt")));
    }

    @PostMapping("/{id}/revoke")
    public Map<String, Boolean> revoke(@PathVariable String id) { auth.revoke(id); return Map.of("revoked", true); }
}
