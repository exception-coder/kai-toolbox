package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ModelInfo;
import com.exceptioncoder.toolbox.claudechat.service.ProviderModelService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 第三方网关「服务商」相关查询：新建会话表单用它拉网关模型目录供选择。
 * 鉴权信息由前端档案（localStorage）传入，后端只代理一次请求，不持久化 key。
 */
@RestController
@RequestMapping("/api/claude-chat/provider")
public class ProviderController {

    private final ProviderModelService service;

    public ProviderController(ProviderModelService service) {
        this.service = service;
    }

    public record ModelsRequest(String baseUrl, String key) {}

    public record ModelsResponse(List<ModelInfo> models) {}

    @PostMapping("/models")
    public ModelsResponse models(@RequestBody ModelsRequest req) {
        return new ModelsResponse(service.fetchModels(req.baseUrl(), req.key()));
    }
}
