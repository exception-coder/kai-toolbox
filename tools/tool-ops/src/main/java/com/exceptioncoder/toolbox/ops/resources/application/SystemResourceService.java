package com.exceptioncoder.toolbox.ops.resources.application;

import com.exceptioncoder.toolbox.common.resource.ProjectSystemDirectory;
import com.exceptioncoder.toolbox.common.resource.ResourceCall;
import com.exceptioncoder.toolbox.common.resource.ResourceDescriptor;
import com.exceptioncoder.toolbox.common.resource.ResourceProvider;
import com.exceptioncoder.toolbox.ops.resources.domain.ResourceBinding;
import com.exceptioncoder.toolbox.ops.resources.domain.ResourceBindingStore;
import org.springframework.stereotype.Service;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** 配置、内置工具和 MCP 共用的资源关系与执行边界。 */
@Service
public class SystemResourceService {
    private static final Set<String> TEST_ENVIRONMENTS = Set.of("LOCAL", "DEV", "TEST", "UAT");
    private final Map<String, ResourceProvider> providers;
    private final List<ProjectSystemDirectory> directories;
    private final ResourceBindingStore store;

    public SystemResourceService(List<ResourceProvider> providers, List<ProjectSystemDirectory> directories,
                                 ResourceBindingStore store) {
        Map<String, ResourceProvider> indexed = new LinkedHashMap<>();
        for (ResourceProvider provider : providers) {
            if (indexed.putIfAbsent(provider.id(), provider) != null) {
                throw new IllegalStateException("资源 provider 标识重复：" + provider.id());
            }
        }
        this.providers = Map.copyOf(indexed);
        this.directories = List.copyOf(directories);
        this.store = store;
    }

    public Catalog catalog() {
        List<AvailableResource> resources = new ArrayList<>();
        List<String> unavailable = new ArrayList<>();
        providers.forEach((id, provider) -> {
            try { provider.resources().forEach(resource -> resources.add(new AvailableResource(id, resource))); }
            catch (RuntimeException exception) { unavailable.add(id); }
        });
        return new Catalog(directories.stream().flatMap(directory -> directory.systems().stream()).toList(),
                List.copyOf(resources), store.list(), List.copyOf(unavailable));
    }

    public List<BoundResource> discover(String systemId) {
        requireSystem(systemId);
        Catalog catalog = catalog();
        return catalog.bindings().stream().filter(binding -> binding.systemId().equals(systemId))
                .map(binding -> {
                    ResourceDescriptor resource = catalog.resources().stream()
                            .filter(item -> item.providerId().equals(binding.providerId())
                                    && item.resource().id().equals(binding.resourceId()))
                            .map(AvailableResource::resource).findFirst().orElse(null);
                    String state = !binding.enabled() ? "DISABLED" : resource == null ? "UNAVAILABLE"
                            : !testEnvironment(resource) ? "RESTRICTED"
                            : resource.capabilities().isEmpty() ? "REGISTRATION_ONLY" : "AVAILABLE";
                    return new BoundResource(binding, resource, state);
                }).toList();
    }

    public void bind(String systemId, String providerId, String resourceId, String purpose, boolean enabled) {
        requireSystem(systemId);
        resolve(providerId, resourceId);
        if (purpose != null && purpose.length() > 500) throw new IllegalArgumentException("用途不能超过 500 字符");
        store.save(new ResourceBinding(UUID.randomUUID().toString(), systemId, providerId, resourceId,
                purpose == null ? "" : purpose.trim(), enabled));
    }

    public void unbind(String id) { store.delete(id); }

    public Object execute(String bindingId, ResourceCall call) {
        ResourceBinding binding = store.list().stream().filter(item -> item.id().equals(bindingId)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("资源关系不存在，请重新发现资源"));
        requireSystem(binding.systemId());
        if (!binding.enabled()) throw new IllegalArgumentException("资源关系已停用");
        ResourceDescriptor resource = resolve(binding.providerId(), binding.resourceId());
        if (!testEnvironment(resource)) throw new IllegalArgumentException("仅允许本地、开发或测试环境资源");
        if (call == null || call.operation() == null || !resource.capabilities().contains(call.operation())) {
            throw new IllegalArgumentException("该资源不支持此操作，请检查能力清单");
        }
        return providers.get(binding.providerId()).execute(binding.resourceId(), call);
    }

    private void requireSystem(String id) {
        if (id == null || directories.stream().flatMap(directory -> directory.systems().stream())
                .noneMatch(system -> system.id().equals(id))) throw new IllegalArgumentException("系统未登记，请先到项目库登记");
    }

    private ResourceDescriptor resolve(String providerId, String resourceId) {
        if (providerId == null || providerId.isBlank() || resourceId == null || resourceId.isBlank()) {
            throw new IllegalArgumentException("请选择有效的连接器和资源");
        }
        ResourceProvider provider = providers.get(providerId);
        if (provider == null) throw new IllegalArgumentException("资源连接器不可用");
        return provider.resources().stream().filter(resource -> resource.id().equals(resourceId)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("源资源已不存在，请重新关联"));
    }

    private static boolean testEnvironment(ResourceDescriptor resource) {
        return resource.environment() != null
                && TEST_ENVIRONMENTS.contains(resource.environment().trim().toUpperCase(Locale.ROOT));
    }

    public record AvailableResource(String providerId, ResourceDescriptor resource) { }
    public record BoundResource(ResourceBinding binding, ResourceDescriptor resource, String state) { }
    public record Catalog(List<ProjectSystemDirectory.SystemIdentity> systems, List<AvailableResource> resources,
                          List<ResourceBinding> bindings, List<String> unavailableProviders) { }
}
