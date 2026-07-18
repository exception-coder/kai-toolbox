package com.exceptioncoder.toolbox.knowledgegraph.service.impl;

import com.exceptioncoder.toolbox.knowledgegraph.model.ProjectRef;
import com.exceptioncoder.toolbox.knowledgegraph.service.LocalProjectSelectionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
public class LocalProjectSelectionServiceImpl implements LocalProjectSelectionService {

    private static final int MAX_RECENT = 20;

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final Path storeFile = Path.of(System.getProperty("user.home"), ".kai-toolbox", "knowledge-graph", "recent-projects.json");

    @Override
    public synchronized List<ProjectRef> recentProjects() {
        return load();
    }

    @Override
    public ProjectRef resolve(String absolutePath) {
        if (absolutePath == null || absolutePath.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请提供项目路径");
        }
        Path path = Path.of(absolutePath);
        if (!Files.isDirectory(path)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "目录不存在：" + absolutePath);
        }
        String displayName = path.getFileName() != null ? path.getFileName().toString() : absolutePath;
        return new ProjectRef(path.toString(), displayName, Instant.now());
    }

    @Override
    public synchronized void recordRecent(ProjectRef project) {
        List<ProjectRef> list = load();
        list.removeIf(p -> p.path().equals(project.path()));
        list.add(0, project);
        if (list.size() > MAX_RECENT) {
            list = list.subList(0, MAX_RECENT);
        }
        save(list);
    }

    private List<ProjectRef> load() {
        if (!Files.exists(storeFile)) {
            return new ArrayList<>();
        }
        try {
            ProjectRef[] arr = mapper.readValue(storeFile.toFile(), ProjectRef[].class);
            return new ArrayList<>(List.of(arr));
        } catch (IOException e) {
            log.warn("读取 recent-projects.json 失败，视为空列表：{}", e.getMessage());
            return new ArrayList<>();
        }
    }

    private void save(List<ProjectRef> list) {
        try {
            Files.createDirectories(storeFile.getParent());
            mapper.writeValue(storeFile.toFile(), list);
        } catch (IOException e) {
            log.warn("写入 recent-projects.json 失败：{}", e.getMessage());
        }
    }
}
