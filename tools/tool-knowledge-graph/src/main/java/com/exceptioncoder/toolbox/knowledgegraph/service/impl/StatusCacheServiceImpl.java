package com.exceptioncoder.toolbox.knowledgegraph.service.impl;

import com.exceptioncoder.toolbox.knowledgegraph.model.GraphRepo;
import com.exceptioncoder.toolbox.knowledgegraph.model.GraphifyGraphState;
import com.exceptioncoder.toolbox.knowledgegraph.model.ProjectStatusSnapshot;
import com.exceptioncoder.toolbox.knowledgegraph.model.RegistrationState;
import com.exceptioncoder.toolbox.knowledgegraph.repository.StatusCacheRepository;
import com.exceptioncoder.toolbox.knowledgegraph.service.DomainKnowledgeStatusService;
import com.exceptioncoder.toolbox.knowledgegraph.service.GraphifyProjectStatusService;
import com.exceptioncoder.toolbox.knowledgegraph.service.StatusCacheService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

@Slf4j
@Service
public class StatusCacheServiceImpl implements StatusCacheService {

    private final GraphifyProjectStatusService graphifyStatusService;
    private final DomainKnowledgeStatusService domainKnowledgeStatusService;
    private final StatusCacheRepository repository;

    // 仅用于把旧的 status-cache.json 一次性迁移进数据库
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final Path legacyFile = Path.of(System.getProperty("user.home"), ".kai-toolbox", "knowledge-graph", "status-cache.json");
    private volatile boolean legacyMigrated = false;

    public StatusCacheServiceImpl(GraphifyProjectStatusService graphifyStatusService,
                                   DomainKnowledgeStatusService domainKnowledgeStatusService,
                                   StatusCacheRepository repository) {
        this.graphifyStatusService = graphifyStatusService;
        this.domainKnowledgeStatusService = domainKnowledgeStatusService;
        this.repository = repository;
    }

    @Override
    public synchronized Map<String, ProjectStatusSnapshot> getCached() {
        return load();
    }

    @Override
    public Map<String, ProjectStatusSnapshot> refresh(List<String> paths) {
        if (paths == null || paths.isEmpty()) {
            return Map.of();
        }
        List<String> normalized = paths.stream()
                .filter(p -> p != null && !p.isBlank())
                .map(p -> Path.of(p).normalize().toString())
                .distinct()
                .toList();

        Map<String, ProjectStatusSnapshot> fresh = new LinkedHashMap<>();
        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            Map<String, Future<ProjectStatusSnapshot>> futures = new LinkedHashMap<>();
            for (String path : normalized) {
                futures.put(path, executor.submit(() -> detectOne(path)));
            }
            for (Map.Entry<String, Future<ProjectStatusSnapshot>> entry : futures.entrySet()) {
                try {
                    fresh.put(entry.getKey(), entry.getValue().get());
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    log.warn("状态检测被中断：{}", entry.getKey());
                } catch (ExecutionException e) {
                    log.warn("状态检测失败 {}：{}", entry.getKey(), e.getCause() != null ? e.getCause().getMessage() : e.getMessage());
                }
            }
        }

        // 登记到本地数据库（按 project_path upsert，作为该项目的最新检测历史）
        for (ProjectStatusSnapshot snapshot : fresh.values()) {
            repository.upsert(snapshot);
        }
        return fresh;
    }

    private ProjectStatusSnapshot detectOne(String path) {
        GraphifyGraphState graphifyState = safeGraphifyState(path);
        String[] businessError = {null};
        RegistrationState domainState = safeRegistrationState(path, GraphRepo.DOMAIN_KNOWLEDGE, businessError);
        RegistrationState crossState = safeRegistrationState(path, GraphRepo.CROSS_TOPOLOGY, businessError);
        RegistrationState businessState = worse(domainState, crossState);
        return new ProjectStatusSnapshot(path, graphifyState, businessState, businessError[0], Instant.now());
    }

    private GraphifyGraphState safeGraphifyState(String path) {
        try {
            return graphifyStatusService.detectStatus(path).state();
        } catch (RuntimeException e) {
            log.debug("Graphify 状态检测失败 {}：{}", path, e.getMessage());
            return null;
        }
    }

    private RegistrationState safeRegistrationState(String path, GraphRepo repo, String[] errorHolder) {
        try {
            return domainKnowledgeStatusService.detectStatus(path, repo).state();
        } catch (RuntimeException e) {
            errorHolder[0] = errorHolder[0] == null ? e.getMessage() : errorHolder[0] + "；" + e.getMessage();
            return null;
        }
    }

    private RegistrationState worse(RegistrationState a, RegistrationState b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.ordinal() <= b.ordinal() ? a : b;
    }

    /** 从数据库读全部历史；首次且库为空时，把旧 status-cache.json 一次性迁移进库。 */
    private Map<String, ProjectStatusSnapshot> load() {
        Map<String, ProjectStatusSnapshot> db = repository.findAll();
        if (db.isEmpty() && !legacyMigrated) {
            legacyMigrated = true;
            Map<String, ProjectStatusSnapshot> legacy = loadLegacyJson();
            if (!legacy.isEmpty()) {
                legacy.values().forEach(repository::upsert);
                log.info("[knowledge-graph] 已迁移 {} 条历史状态：status-cache.json -> 数据库", legacy.size());
                return repository.findAll();
            }
        }
        return db;
    }

    /** 读旧的 status-cache.json（仅供一次性迁移）；不存在/损坏返回空。 */
    private Map<String, ProjectStatusSnapshot> loadLegacyJson() {
        if (!Files.exists(legacyFile)) {
            return new LinkedHashMap<>();
        }
        try {
            ProjectStatusSnapshot[] arr = mapper.readValue(legacyFile.toFile(), ProjectStatusSnapshot[].class);
            Map<String, ProjectStatusSnapshot> map = new LinkedHashMap<>();
            for (ProjectStatusSnapshot s : arr) {
                map.put(s.projectPath(), s);
            }
            return map;
        } catch (IOException e) {
            log.warn("读取旧 status-cache.json 失败，跳过迁移：{}", e.getMessage());
            return new LinkedHashMap<>();
        }
    }
}
