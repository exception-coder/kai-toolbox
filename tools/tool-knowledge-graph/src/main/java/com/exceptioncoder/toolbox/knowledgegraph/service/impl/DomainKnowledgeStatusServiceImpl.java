package com.exceptioncoder.toolbox.knowledgegraph.service.impl;

import com.exceptioncoder.toolbox.knowledgegraph.config.KnowledgeGraphProperties;
import com.exceptioncoder.toolbox.knowledgegraph.model.*;
import com.exceptioncoder.toolbox.knowledgegraph.service.DomainKnowledgeStatusService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** 兼容状态入口；只从独立拓扑引擎查询关系登记，不恢复集中领域知识。 */
@Service
public class DomainKnowledgeStatusServiceImpl implements DomainKnowledgeStatusService {
    private final KnowledgeGraphProperties props;
    public DomainKnowledgeStatusServiceImpl(KnowledgeGraphProperties props) { this.props = props; }

    @Override
    public DomainKnowledgeStatus detectStatus(String projectRootPath, GraphRepo repo) {
        if (repo == GraphRepo.DOMAIN_KNOWLEDGE) {
            throw new ResponseStatusException(HttpStatus.GONE,
                    "集中 Domain Knowledge 已退役，请读取目标项目 docs/INDEX.md、docs/domain/ 和已有规格。");
        }
        if (projectRootPath == null || projectRootPath.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请提供项目根路径");
        }
        Path project = Path.of(projectRootPath).toAbsolutePath().normalize();
        String key = project.getFileName().toString();
        Path root = Path.of(props.getCrossTopologyRepoPath());
        Path entry = root.resolve("dist/knowledge.js");
        if (!Files.isRegularFile(entry)) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "独立 cross-project-topology 尚未构建，请通过团队依赖更新入口准备；不需要公共知识仓库。");
        Path output = null;
        Process process = null;
        try {
            output = Files.createTempFile("forge-topology-status-", ".json");
            ProcessBuilder builder = new ProcessBuilder(props.getNodeExecutable(), "--input-type=module", "-e",
                    "const m=await import(process.argv[1]); console.log(JSON.stringify(m.listModules(process.argv[2],{inheritSources:false})));",
                    entry.toAbsolutePath().toUri().toString(), key);
            builder.environment().put("TOPOLOGY_KB_DIR", root.resolve("knowledge").toAbsolutePath().toString());
            process = builder.redirectErrorStream(true).redirectOutput(output.toFile()).start();
            if (!process.waitFor(30, TimeUnit.SECONDS)) throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT,
                    "独立拓扑状态检测超时");
            if (process.exitValue() != 0 || Files.size(output) > 1_000_000) throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "独立拓扑状态检测失败，请核对构建和 Node 环境");
            var modules = new ObjectMapper().readTree(Files.readString(output));
            if (!modules.isArray()) throw new IllegalArgumentException("拓扑返回格式无效");
            int total = modules.size();
            int covered = 0;
            for (var module : modules) if (module.path("count").asInt() > 0) covered++;
            return new DomainKnowledgeStatus(total == 0 ? RegistrationState.NOT_REGISTERED
                    : covered == total ? RegistrationState.REGISTERED : RegistrationState.PARTIAL,
                    total, covered, List.of(), Instant.now());
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "拓扑检测被中断");
        } catch (java.io.IOException | IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "独立拓扑资料不可读取");
        } finally {
            if (process != null && process.isAlive()) process.destroyForcibly();
            if (output != null) try { Files.deleteIfExists(output); } catch (java.io.IOException ignored) { }
        }
    }
}
