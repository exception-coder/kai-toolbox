package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.llm.spi.AgentAccountValidator;
import org.springframework.stereotype.Service;

/** Uses the runtime's authenticated control channel, never the local catalog cache as login proof. */
@Service
public class ConsultAccountValidator implements AgentAccountValidator {
    private final SidecarClient sidecar;
    private final CodexModelCatalogService catalog;

    public ConsultAccountValidator(SidecarClient sidecar, CodexModelCatalogService catalog) {
        this.sidecar = sidecar;
        this.catalog = catalog;
    }

    @Override
    public Result validate(String codexHome, String model) {
        try {
            // Reuse its canonical path/symlink boundary; cached entries are not authorization evidence.
            catalog.list(codexHome);
        } catch (RuntimeException invalid) {
            return new Result(false, "ACCOUNT_NOT_ALLOWED", "所选账号不在平台允许的授权目录中", System.currentTimeMillis());
        }
        var result = sidecar.inspectConsultAccount(codexHome, model, 45000).orElse(null);
        if (result == null || result.path("protocolVersion").asInt() != 1) {
            return new Result(false, "PROBE_UNAVAILABLE", "账号检测未完成，请检查运行服务版本及连接后重试", System.currentTimeMillis());
        }
        return new Result(result.path("available").asBoolean(), result.path("code").asText("PROBE_FAILED"),
                result.path("message").asText("账号检测失败，请联系管理员重新登录并核对工作区授权"),
                result.path("checkedAt").asLong(System.currentTimeMillis()));
    }
}
