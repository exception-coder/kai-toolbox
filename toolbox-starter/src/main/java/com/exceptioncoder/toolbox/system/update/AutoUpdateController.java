package com.exceptioncoder.toolbox.system.update;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Java 内置自动更新的只读状态与人工立即检查入口。 */
@RestController
@RequestMapping("/api/system/auto-update")
@RequireAuth
public class AutoUpdateController {

    private final JavaAutoUpdateService service;

    public AutoUpdateController(JavaAutoUpdateService service) {
        this.service = service;
    }

    @GetMapping("/status")
    public AutoUpdateStatusView status() {
        return service.status();
    }

    @PostMapping("/check")
    public ResponseEntity<Map<String, Object>> checkNow() {
        boolean accepted = service.requestCheck();
        return accepted
                ? ResponseEntity.accepted().body(Map.of("accepted", true, "state", "checking"))
                : ResponseEntity.status(409).body(Map.of(
                        "accepted", false,
                        "state", service.status().state(),
                        "message", "自动更新已关闭、正在退出或已有检查运行中"));
    }
}
