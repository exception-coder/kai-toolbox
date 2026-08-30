package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.AgentManagementSnapshot;
import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.AgentReleaseGate;
import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.AgentVersion;
import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.BusinessConsultCapabilityCatalog;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultAgentManagementRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultAgentManagementRepository.AgentDefinition;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 业务咨询 Agent 查询、候选保存、发布和回滚用例。
 */
@Service
public class ConsultAgentManagementService {

    private static final Set<String> ORCHESTRATION_VERSIONS = Set.of("v1", "v2", "v3", "v4");
    private static final int MAX_NAME_LENGTH = 100;
    private static final int MAX_CAPABILITIES = 30;

    private final ConsultAgentManagementRepository repository;
    private final BusinessConsultSmokeSampleSource smokeSampleSource;

    public ConsultAgentManagementService(ConsultAgentManagementRepository repository,
                                         BusinessConsultSmokeSampleSource smokeSampleSource) {
        this.repository = repository;
        this.smokeSampleSource = smokeSampleSource;
    }

    public AgentManagementSnapshot getSnapshot() {
        AgentDefinition definition = repository.findDefinition();
        List<AgentVersion> versions = repository.findVersions();
        AgentVersion production = findByStatus(versions, "PRODUCTION");
        AgentVersion candidate = findByStatus(versions, "CANDIDATE");
        return new AgentManagementSnapshot(
                definition.id(),
                definition.name(),
                definition.owner(),
                definition.description(),
                definition.endpoint(),
                definition.framework(),
                definition.observabilityUrl(),
                production,
                candidate,
                versions,
                BusinessConsultCapabilityCatalog.capabilities(),
                capabilityIds(production),
                capabilityIds(candidate),
                smokeSampleSource.preview(),
                AgentReleaseGate.evaluate(candidate));
    }

    @Transactional
    public AgentManagementSnapshot createCandidate(CreateAgentVersionCommand rawCommand) {
        repository.replaceCandidate(normalize(rawCommand), System.currentTimeMillis());
        return getSnapshot();
    }

    @Transactional
    public AgentManagementSnapshot release(long version) {
        AgentVersion target = requireVersion(version);
        if ("PRODUCTION".equals(target.status())) {
            return getSnapshot();
        }
        if (!"CANDIDATE".equals(target.status())) {
            throw new IllegalArgumentException("只有 Candidate 版本可以发布");
        }
        AgentReleaseGate gate = AgentReleaseGate.evaluate(target);
        if (!gate.releasable()) {
            throw new IllegalArgumentException(gate.reason());
        }
        repository.promote(version, "RELEASE", System.currentTimeMillis());
        return getSnapshot();
    }

    @Transactional
    public AgentManagementSnapshot rollback(long version) {
        AgentVersion target = requireVersion(version);
        if ("PRODUCTION".equals(target.status())) {
            return getSnapshot();
        }
        if (!"HISTORICAL".equals(target.status()) || target.releasedAt() == null) {
            throw new IllegalArgumentException("只能回滚到曾发布过的历史 Production 版本");
        }
        repository.promote(version, "ROLLBACK", System.currentTimeMillis());
        return getSnapshot();
    }

    private CreateAgentVersionCommand normalize(CreateAgentVersionCommand command) {
        if (command == null) {
            throw new IllegalArgumentException("Candidate 配置不能为空");
        }
        String model = requireText(command.model(), "模型");
        String promptRef = requireText(command.promptRef(), "Prompt 引用");
        String orchestrationVersion = requireText(command.orchestrationVersion(), "编排版本").toLowerCase();
        if (!ORCHESTRATION_VERSIONS.contains(orchestrationVersion)) {
            throw new IllegalArgumentException("编排版本仅支持 v1、v2、v3、v4");
        }
        if (command.temperature() < 0 || command.temperature() > 2) {
            throw new IllegalArgumentException("Temperature 必须在 0 至 2 之间");
        }
        if (command.evaluationScore() != null
                && (command.evaluationScore() < 0 || command.evaluationScore() > 100)) {
            throw new IllegalArgumentException("评测分数必须在 0 至 100 之间");
        }
        return new CreateAgentVersionCommand(
                model,
                command.temperature(),
                promptRef,
                orchestrationVersion,
                normalizeNames(command.tools(), "Tools"),
                normalizeNames(command.mcpServers(), "MCP"),
                normalizeNames(command.skills(), "Skills"),
                trimToNull(command.evaluationRunId()),
                command.evaluationScore(),
                command.evaluationPassed());
    }

    private AgentVersion requireVersion(long version) {
        return repository.findVersion(version)
                .orElseThrow(() -> new IllegalArgumentException("Agent 版本不存在: v" + version));
    }

    private AgentVersion findByStatus(List<AgentVersion> versions, String status) {
        return versions.stream()
                .filter(version -> status.equals(version.status()))
                .findFirst()
                .orElse(null);
    }

    private List<String> capabilityIds(AgentVersion version) {
        if (version == null) {
            return List.of();
        }
        List<String> ids = new java.util.ArrayList<>();
        version.mcpServers().forEach(name -> ids.add("mcp:" + name));
        version.tools().forEach(name -> ids.add("tool:" + name));
        version.skills().forEach(name -> ids.add("skill:" + name));
        return List.copyOf(ids);
    }

    private List<String> normalizeNames(List<String> values, String field) {
        if (values == null) {
            return List.of();
        }
        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        for (String value : values) {
            String name = trimToNull(value);
            if (name != null) {
                if (name.length() > MAX_NAME_LENGTH) {
                    throw new IllegalArgumentException(field + " 名称不能超过 " + MAX_NAME_LENGTH + " 个字符");
                }
                normalized.add(name);
            }
        }
        if (normalized.size() > MAX_CAPABILITIES) {
            throw new IllegalArgumentException(field + " 最多配置 " + MAX_CAPABILITIES + " 项");
        }
        return List.copyOf(normalized);
    }

    private String requireText(String value, String field) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            throw new IllegalArgumentException(field + "不能为空");
        }
        if (normalized.length() > MAX_NAME_LENGTH) {
            throw new IllegalArgumentException(field + "不能超过 " + MAX_NAME_LENGTH + " 个字符");
        }
        return normalized;
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
