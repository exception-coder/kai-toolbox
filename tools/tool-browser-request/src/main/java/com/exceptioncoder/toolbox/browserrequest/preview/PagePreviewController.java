package com.exceptioncoder.toolbox.browserrequest.preview;

import com.exceptioncoder.toolbox.common.auth.AuthException;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.resource.BrowserLoginTarget;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

/** 当前用户创建及查看自己的页面预览，URL 中不携带认证令牌。 */
@RestController
@RequestMapping("/api/page-previews")
@RequireAuth
public class PagePreviewController {
    private final PagePreviewService previews;
    private final PreviewTargets targets;

    public PagePreviewController(PagePreviewService previews, PreviewTargets targets) {
        this.previews = previews; this.targets = targets;
    }

    @GetMapping("/resources")
    public List<BrowserLoginTarget> resources() { return targets.resources(user()); }

    @PostMapping
    public PagePreviewService.View create(@Valid @RequestBody PreviewRequest request, HttpServletRequest http) {
        String authorization = http.getHeader("Authorization");
        String token = authorization != null && authorization.startsWith("Bearer ")
                ? authorization.substring(7).trim() : null;
        return previews.create(request, user(), token);
    }

    @GetMapping("/{id}")
    public PagePreviewService.View get(@PathVariable String id) { return previews.get(id, user()); }

    @GetMapping(value = "/{id}/screenshot", produces = MediaType.IMAGE_JPEG_VALUE)
    public ResponseEntity<byte[]> screenshot(@PathVariable String id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Content-Type-Options", "nosniff")
                .body(previews.screenshot(id, user()));
    }

    @PostMapping("/{id}/resume")
    public PagePreviewService.View resume(@PathVariable String id) { return previews.resume(id, user()); }

    @PostMapping("/{id}/input")
    public void input(@PathVariable String id, @Valid @RequestBody PreviewInput input) {
        previews.input(id, user(), input);
    }

    @DeleteMapping("/{id}")
    public void close(@PathVariable String id) { previews.close(id, user()); }

    private AuthPrincipal user() { return AuthContext.current().orElseThrow(AuthException::tokenInvalid); }
}
