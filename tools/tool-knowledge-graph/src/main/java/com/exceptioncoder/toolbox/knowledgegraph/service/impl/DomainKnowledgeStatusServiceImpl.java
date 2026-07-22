package com.exceptioncoder.toolbox.knowledgegraph.service.impl;

import com.exceptioncoder.toolbox.knowledgegraph.config.KnowledgeGraphProperties;
import com.exceptioncoder.toolbox.knowledgegraph.model.DomainKnowledgeStatus;
import com.exceptioncoder.toolbox.knowledgegraph.model.GraphRepo;
import com.exceptioncoder.toolbox.knowledgegraph.model.ModuleGap;
import com.exceptioncoder.toolbox.knowledgegraph.model.RegistrationState;
import com.exceptioncoder.toolbox.knowledgegraph.service.DomainKnowledgeStatusService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
public class DomainKnowledgeStatusServiceImpl implements DomainKnowledgeStatusService {

    // gaps 命令每行结尾要么是"；缺类型 → ..."要么是"；6 类齐"，二选一必有，不是可选后缀。
    // 模块中文名 (name) 仅当 impl/modules.json 登记了该 key 才有——cross-topology 从不登记 modules.json，
    // 每行永远是裸 key（无括号），故 (name) 部分必须整体可选，否则这类行会被漏判成"不存在"。
    private static final Pattern GAP_LINE = Pattern.compile(
            "^- (?<key>[a-z0-9-]+)(\\((?<name>[^)]+)\\))?: (?<count>\\d+) 条(?<empty> ⚠ 空)?(；缺类型 → (?<missing>.+)|；6 类齐)$"
    );

    private final KnowledgeGraphProperties props;

    public DomainKnowledgeStatusServiceImpl(KnowledgeGraphProperties props) {
        this.props = props;
    }

    @Override
    public DomainKnowledgeStatus detectStatus(String projectRootPath, GraphRepo repo) {
        if (projectRootPath == null || projectRootPath.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请提供项目根路径");
        }
        String projectKey = Path.of(projectRootPath).getFileName().toString();

        // cross-project-topology 没有自己的 package.json/dist/server.js/scripts/bootstrap.mjs——
        // 它是纯内容仓库，复用 project-domain-knowledge 的引擎，靠 DOMAIN_KB_DIR 环境变量指向
        // 它自己的 knowledge/ 目录（见 project-domain-knowledge/src/knowledge.ts 的 KB_DIR 解析）。
        // 因此"引擎根目录"(跑脚本、查 dist/server.js 的地方)永远是 domainKnowledgeRepoPath，
        // crossTopologyRepoPath 只用来算 DOMAIN_KB_DIR 覆盖值，两者不能混用。
        String engineRoot = props.getDomainKnowledgeRepoPath();
        if (engineRoot == null || engineRoot.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "请先在配置中心设置 knowledge-graph.domain-knowledge-repo-path（cross-topology 检测同样依赖这个引擎仓库）");
        }
        Path distEntry = Path.of(engineRoot, "dist", "server.js");
        if (!Files.exists(distEntry)) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "引擎仓库尚未构建：" + engineRoot + " 缺少 dist/server.js，请先 npm install && npm run build");
        }

        String kbDirOverride = null;
        if (repo == GraphRepo.CROSS_TOPOLOGY) {
            String topologyRepo = props.getCrossTopologyRepoPath();
            if (topologyRepo == null || topologyRepo.isBlank()) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                        "请先在配置中心设置 knowledge-graph.cross-topology-repo-path");
            }
            kbDirOverride = Path.of(topologyRepo, "knowledge").toString();
        }

        String stdout = runGaps(engineRoot, projectKey, kbDirOverride);
        Instant now = Instant.now();

        int total = 0;
        int covered = 0;
        List<ModuleGap> gaps = new ArrayList<>();
        for (String line : stdout.split("\\R")) {
            Matcher m = GAP_LINE.matcher(line.trim());
            if (!m.matches()) {
                continue;
            }
            total++;
            int count = Integer.parseInt(m.group("count"));
            if (count > 0) {
                covered++;
            }
            if (m.group("empty") != null) {
                String missing = m.group("missing");
                List<String> missingTypes = missing == null ? List.of() : Arrays.asList(missing.split(","));
                String name = m.group("name") != null ? m.group("name") : m.group("key");
                gaps.add(new ModuleGap(m.group("key"), name, count, missingTypes));
            }
        }
        // gaps 命令对未登记项目(无 impl/modules.json)不报错，只是不产出任何模块行——total==0 是唯一信号
        RegistrationState state = total == 0
                ? RegistrationState.NOT_REGISTERED
                : (gaps.isEmpty() ? RegistrationState.REGISTERED : RegistrationState.PARTIAL);
        return new DomainKnowledgeStatus(state, total, covered, gaps, now);
    }

    private String runGaps(String engineRoot, String projectKey, String kbDirOverride) {
        try {
            ProcessBuilder pb = new ProcessBuilder(props.getNodeExecutable(), "scripts/bootstrap.mjs", "gaps", projectKey)
                    .directory(new java.io.File(engineRoot))
                    .redirectErrorStream(true);
            if (kbDirOverride != null) {
                pb.environment().put("DOMAIN_KB_DIR", kbDirOverride);
            }
            Process p = pb.start();
            String out;
            try (var in = p.getInputStream()) {
                out = new String(in.readAllBytes());
            }
            boolean finished = p.waitFor(30, TimeUnit.SECONDS);
            if (!finished) {
                p.destroyForcibly();
                throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT, "gaps 命令执行超时");
            }
            return out;
        } catch (IOException e) {
            log.warn("执行 bootstrap.mjs gaps 失败：{}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "无法执行 node（请确认已安装 Node.js 且可在 PATH 中找到）：" + e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "检测被中断");
        }
    }
}
