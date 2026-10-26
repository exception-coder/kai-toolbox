package com.exceptioncoder.toolbox.browserrequest.preview;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 浏览器预览目标；只接收资源引用与页面信息，不接收账号密码。 */
public record PreviewRequest(@NotBlank @Size(max = 100) String requestKey,
                             @Size(max = 256) String origin, @NotBlank @Size(max = 1024) String route,
                             @Size(max = 100) String resourceId, @Size(max = 256) String loginPage,
                             @Size(max = 200) String readySelector, @Size(max = 40) String device,
                             @Size(max = 40) String scene, @Size(max = 100) String sourceRevision,
                             boolean productionConfirmed) {
    public PreviewRequest(String requestKey, String origin, String route, String resourceId, String loginPage,
                          String readySelector, String device, String scene, String sourceRevision) {
        this(requestKey, origin, route, resourceId, loginPage, readySelector, device, scene, sourceRevision, false);
    }
}
