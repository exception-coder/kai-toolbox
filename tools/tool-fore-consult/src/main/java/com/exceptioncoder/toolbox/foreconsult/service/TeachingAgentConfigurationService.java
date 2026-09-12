package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingConfig;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultAgentManagementRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.TeachingAgentRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 复用 Agent 候选版本，原子保存教学配置扩展。 */
@Service
public class TeachingAgentConfigurationService {
    private final ConsultAgentManagementRepository registry;
    private final TeachingAgentRepository teaching;

    public TeachingAgentConfigurationService(ConsultAgentManagementRepository registry, TeachingAgentRepository teaching) {
        this.registry = registry;
        this.teaching = teaching;
    }

    @Transactional
    public long save(TeachingConfig config) {
        config.validate();
        var command = new CreateAgentVersionCommand(config.model(), config.temperature(),
                TeachingConfig.CONTRACT_VERSION, "v1",
                config.lookupEnabled() ? List.of("lookup_sku", "propose_draft") : List.of("propose_draft"),
                List.of(), List.of(), null, null, false);
        var version = registry.replaceCandidate(TeachingConfig.AGENT_ID, command, System.currentTimeMillis());
        teaching.saveConfig(version.version(), config);
        return version.version();
    }

    public long latestVersion() {
        return registry.findVersions(TeachingConfig.AGENT_ID).stream().findFirst().orElseThrow().version();
    }

    public TeachingConfig config(long version) {
        registry.findVersion(TeachingConfig.AGENT_ID, version)
                .orElseThrow(() -> new IllegalArgumentException("教学 Agent 版本不存在"));
        return teaching.config(version);
    }
}
