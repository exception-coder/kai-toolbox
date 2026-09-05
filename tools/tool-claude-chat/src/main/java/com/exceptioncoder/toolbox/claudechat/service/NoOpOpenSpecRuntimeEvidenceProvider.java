package com.exceptioncoder.toolbox.claudechat.service;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.Map;

/** Runtime 监督能力未接入时提供空证据，保证基础看板只展示可证明状态。 */
@Component
@ConditionalOnMissingBean(OpenSpecRuntimeEvidenceProvider.class)
public class NoOpOpenSpecRuntimeEvidenceProvider implements OpenSpecRuntimeEvidenceProvider {

    @Override
    public Map<String, Evidence> evidence(Path projectDirectory, String changeId) {
        return Map.of();
    }
}
