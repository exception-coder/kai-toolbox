package com.exceptioncoder.toolbox.projects.catalog;

import com.exceptioncoder.toolbox.common.project.*;
import com.exceptioncoder.toolbox.projects.registry.domain.ProjectRegistryStore;
import org.springframework.stereotype.Service;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/** 唯一项目目录发现与登记合并用例；其他模块只消费清单。 */
@Service
public class ProjectCatalogService implements ProjectCatalog {
    private final ProjectDirectorySource directories;
    private final ProjectRegistryStore registry;
    private final ProjectAccess access;
    private final ProjectCatalogProperties properties;
    private List<ProjectDisplayNames> names = List.of();

    @org.springframework.beans.factory.annotation.Autowired
    public void setDisplayNames(List<ProjectDisplayNames> names) { this.names = List.copyOf(names); }

    public ProjectCatalogService(ProjectDirectorySource directories, ProjectRegistryStore registry,
                                 ProjectAccess access, ProjectCatalogProperties properties) {
        this.directories = directories;
        this.registry = registry;
        this.access = access;
        this.properties = properties;
    }

    @Override
    public List<Entry> list(boolean includeExcluded) {
        Map<Path, Entry> entries = new LinkedHashMap<>();
        for (Path root : directories.scanRoots()) discover(root, entries);
        for (ProjectDisplayNames provider : names) {
            provider.aliases().forEach((raw, name) -> {
                Path path = ProjectPaths.canonical(Path.of(raw));
                Entry previous = entries.get(path);
                if (previous != null && name != null && !name.isBlank()) {
                    entries.put(path, entry(path, "", name, previous.root(), previous.source()));
                }
            });
        }
        for (var project : registry.projects()) {
            Path path = ProjectPaths.canonical(Path.of(project.metadata().localPath()));
            Entry previous = entries.get(path);
            entries.put(path, entry(path, project.id(), project.metadata().name(),
                    previous == null ? path.getParent().toString() : previous.root(), "REGISTERED"));
        }
        if (includeExcluded) {
            for (String value : properties.getExcludedPaths()) {
                Path path = ProjectPaths.canonical(Path.of(value));
                entries.putIfAbsent(path, entry(path, "", path.getFileName().toString(),
                        path.getParent().toString(), "POLICY"));
            }
        }
        return entries.values().stream().filter(item -> includeExcluded || !item.excluded())
                .sorted(Comparator.comparing(Entry::name, String.CASE_INSENSITIVE_ORDER).thenComparing(Entry::path))
                .toList();
    }

    private void discover(Path root, Map<Path, Entry> entries) {
        if (!Files.isDirectory(root)) return;
        try (var children = Files.list(root)) {
            children.filter(Files::isDirectory).filter(path -> directories.hiddenPrefixes().stream()
                    .noneMatch(prefix -> path.getFileName().toString().startsWith(prefix))).forEach(path -> {
                Path canonical = ProjectPaths.canonical(path);
                entries.putIfAbsent(canonical, entry(canonical, "", path.getFileName().toString(),
                        root.toString(), "DISCOVERED"));
            });
        } catch (IOException error) {
            throw new IllegalStateException("无法读取项目目录，请在项目库检查目录设置：" + root, error);
        }
    }

    private Entry entry(Path path, String systemId, String name, String root, String source) {
        String key = path.toString();
        if (java.io.File.separatorChar == '\\') key = key.toLowerCase(Locale.ROOT);
        String id = UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8)).toString();
        return new Entry(id, systemId, name, path.toString(), root, Files.isDirectory(path),
                !access.allowed(path), source);
    }
}
