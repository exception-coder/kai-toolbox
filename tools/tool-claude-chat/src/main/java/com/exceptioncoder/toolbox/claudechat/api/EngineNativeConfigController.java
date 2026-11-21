package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.EngineNativeConfigService;
import com.exceptioncoder.toolbox.claudechat.service.EngineNativeConfigService.ApplyRequest;
import com.exceptioncoder.toolbox.claudechat.service.EngineNativeConfigService.ApplyResult;
import com.exceptioncoder.toolbox.claudechat.service.EngineNativeConfigService.EngineConfigView;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireRole;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 改写本机引擎的原生模型配置，影响该机器上所有会话，仅管理员可用。 */
@RestController
@RequireRole("ADMIN")
@RequestMapping("/api/claude-chat/engine-native-config")
public class EngineNativeConfigController {
    private final EngineNativeConfigService service;

    public EngineNativeConfigController(EngineNativeConfigService service) { this.service = service; }

    @GetMapping
    public List<EngineConfigView> status() { return service.status(); }

    @PutMapping
    public ApplyResult apply(@RequestBody ApplyRequest request) { return service.apply(request); }
}
