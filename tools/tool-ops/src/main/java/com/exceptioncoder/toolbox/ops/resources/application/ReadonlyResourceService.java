package com.exceptioncoder.toolbox.ops.resources.application;

import com.exceptioncoder.toolbox.common.resource.ProjectSystemDirectory;
import com.exceptioncoder.toolbox.common.resource.ReadonlyResourceGateway;
import com.exceptioncoder.toolbox.common.resource.ResourceCall;
import org.springframework.stereotype.Service;
import java.nio.file.Path;
import java.util.List;

/** 咨询仅复用 QUERY，不能访问应用 CALL。 */
@Service
public class ReadonlyResourceService implements ReadonlyResourceGateway {
    private final SystemResourceService resources;
    private final List<ProjectSystemDirectory> directories;

    public ReadonlyResourceService(SystemResourceService resources, List<ProjectSystemDirectory> directories) {
        this.resources = resources;
        this.directories = directories;
    }

    @Override
    public List<Entry> catalog() {
        return directories.stream().flatMap(directory -> directory.systems().stream()).flatMap(system ->
                resources.discover(system.id()).stream()
                        .filter(item -> item.resource() == null || item.resource().capabilities().contains("QUERY"))
                        .map(item -> new Entry(item.binding().id(), system.id(), system.name(),
                                item.resource() == null ? item.binding().resourceId() : item.resource().name(),
                                item.resource() == null ? "UNKNOWN" : item.resource().environment(),
                                item.binding().purpose(), item.state(), "/tools/reqpool/resources"))).toList();
    }

    @Override
    public List<Entry> discover(String sourcePath, List<String> bindingIds) {
        String systemId = systemId(sourcePath);
        return catalog().stream().filter(entry -> entry.systemId().equals(systemId)
                && bindingIds.contains(entry.bindingId())).toList();
    }

    @Override
    public Object query(String sourcePath, List<String> bindingIds, String bindingId, String sql) {
        var resource = discover(sourcePath, bindingIds).stream().filter(entry -> entry.bindingId().equals(bindingId))
                .findFirst().orElseThrow(() -> new IllegalArgumentException("资源未在本咨询配置中授权或不属于当前系统"));
        if (!"AVAILABLE".equals(resource.state())) throw new IllegalArgumentException("资源当前不可查询：" + resource.state());
        return resources.execute(bindingId, new ResourceCall("QUERY", sql, null, null, null, null));
    }

    private String systemId(String sourcePath) {
        if (sourcePath == null || sourcePath.isBlank()) throw new IllegalArgumentException("咨询缺少目标源码目录");
        Path target = Path.of(sourcePath).toAbsolutePath().normalize();
        var matches = directories.stream().flatMap(directory -> directory.systems().stream())
                .filter(system -> system.sourcePath() != null && !system.sourcePath().isBlank()
                        && Path.of(system.sourcePath()).toAbsolutePath().normalize().equals(target)).toList();
        if (matches.size() != 1) throw new IllegalArgumentException("咨询目录未唯一关联项目库系统，请检查系统资源关联");
        return matches.getFirst().id();
    }
}
