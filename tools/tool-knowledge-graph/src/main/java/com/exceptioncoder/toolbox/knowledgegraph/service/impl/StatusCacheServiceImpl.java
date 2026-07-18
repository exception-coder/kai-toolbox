package com.exceptioncoder.toolbox.knowledgegraph.service.impl;

import com.exceptioncoder.toolbox.knowledgegraph.model.GraphRepo;
import com.exceptioncoder.toolbox.knowledgegraph.model.GraphifyGraphState;
import com.exceptioncoder.toolbox.knowledgegraph.model.ProjectStatusSnapshot;
import com.exceptioncoder.toolbox.knowledgegraph.model.RegistrationState;
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
import java.util.ArrayList;
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

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final Path storeFile = Path.of(System.getProperty("user.home"), ".kai-toolbox", "knowledge-graph", "status-cache.json");

    public StatusCacheServiceImpl(GraphifyProjectStatusService graphifyStatusService,
                                   DomainKnowledgeStatusService domainKnowledgeStatusService) {
        this.graphifyStatusService = graphifyStatusService;
        this.domainKnowledgeStatusService = domainKnowledgeStatusService;
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

        synchronized (this) {
            Map<String, ProjectStatusSnapshot> all = load();
            all.putAll(fresh);
            save(all);
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

    private Map<String, ProjectStatusSnapshot> load() {
        if (!Files.exists(storeFile)) {
            return new LinkedHashMap<>();
        }
        try {
            ProjectStatusSnapshot[] arr = mapper.readValue(storeFile.toFile(), ProjectStatusSnapshot[].class);
            Map<String, ProjectStatusSnapshot> map = new LinkedHashMap<>();
            for (ProjectStatusSnapshot s : arr) {
                map.put(s.projectPath(), s);
            }
            return map;
        } catch (IOException e) {
            log.warn("读取 status-cache.json 失败，视为空缓存：{}", e.getMessage());
            return new LinkedHashMap<>();
        }
    }

    private void save(Map<String, ProjectStatusSnapshot> map) {
        try {
            Files.createDirectories(storeFile.getParent());
            mapper.writeValue(storeFile.toFile(), new ArrayList<>(map.values()));
        } catch (IOException e) {
            log.warn("写入 status-cache.json 失败：{}", e.getMessage());
        }
    }
}
