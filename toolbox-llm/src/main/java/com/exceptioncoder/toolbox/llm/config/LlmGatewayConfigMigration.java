package com.exceptioncoder.toolbox.llm.config;

import com.exceptioncoder.toolbox.common.dynamicconfig.repository.DynamicConfigOverrideRepository;
import com.exceptioncoder.toolbox.common.dynamicconfig.service.DynamicConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 一次性迁移：把用户曾在配置中心「AI 对话」里改过并持久化的凭据（{@code toolbox.ai-chat.base-url/api-key}）
 * 搬到中心「LLM 网关」（{@code toolbox.llm.gateway.*}），使凭据集中后用户已配的 key 不丢、无需重设。
 *
 * <p>仅当网关侧还没有对应覆盖、而旧 ai-chat 侧有覆盖时才迁移；用既有的 {@link DynamicConfigService#applyOverrides}
 * 落库 + 实时重绑（本次启动即生效）。env 方式配置的 key 由 application.yml 的默认值链自动兼容，无需迁移。
 * 旧的 ai-chat.api-key/base-url 覆盖行留着无害（字段已移除，绑定时被宽松忽略、配置中心也不再展示）。</p>
 */
@Slf4j
@Component
public class LlmGatewayConfigMigration {

    private final DynamicConfigOverrideRepository repo;
    private final DynamicConfigService service;

    public LlmGatewayConfigMigration(DynamicConfigOverrideRepository repo, DynamicConfigService service) {
        this.repo = repo;
        this.service = service;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void migrate() {
        try {
            Map<String, String> ov = repo.findAll();
            Map<String, String> apply = new LinkedHashMap<>();
            carry(ov, apply, "toolbox.llm.gateway.api-key", "toolbox.ai-chat.api-key");
            carry(ov, apply, "toolbox.llm.gateway.base-url", "toolbox.ai-chat.base-url");
            if (apply.isEmpty()) return;
            service.applyOverrides("toolbox.llm.gateway", apply, List.of());
            log.info("[toolbox-llm] 已把「AI 对话」持久化凭据迁移到中心「LLM 网关」：{}", apply.keySet());
        } catch (Exception e) {
            log.warn("[toolbox-llm] LLM 网关凭据迁移跳过：{}", e.getMessage());
        }
    }

    /** 网关侧无覆盖、旧 ai-chat 侧有非空覆盖 → 迁移到网关 key。 */
    private static void carry(Map<String, String> ov, Map<String, String> apply, String gwKey, String oldKey) {
        String gw = ov.get(gwKey);
        String old = ov.get(oldKey);
        if ((gw == null || gw.isBlank()) && old != null && !old.isBlank()) {
            apply.put(gwKey, old);
        }
    }
}
