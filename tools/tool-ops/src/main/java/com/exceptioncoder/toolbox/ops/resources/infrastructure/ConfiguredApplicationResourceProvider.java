package com.exceptioncoder.toolbox.ops.resources.infrastructure;

import com.exceptioncoder.toolbox.common.resource.ResourceCall;
import com.exceptioncoder.toolbox.common.resource.ResourceDescriptor;
import com.exceptioncoder.toolbox.common.resource.ResourceProvider;
import com.exceptioncoder.toolbox.ops.resources.application.ApplicationResourceExecutor;
import com.exceptioncoder.toolbox.ops.resources.application.ApplicationResourceService;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.List;

@Component
public class ConfiguredApplicationResourceProvider implements ResourceProvider {
    private final ApplicationResourceService resources;
    private final ApplicationResourceExecutor executor;

    public ConfiguredApplicationResourceProvider(ApplicationResourceService resources,
                                                 ApplicationResourceExecutor executor) {
        this.resources = resources;
        this.executor = executor;
    }

    @Override public String id() { return "application"; }

    @Override public List<ResourceDescriptor> resources() {
        return resources.list().stream().map(resource -> new ResourceDescriptor(resource.id(), resource.name(),
                "APP", resource.environment(), endpoint(resource.baseUrl()), resource.username(),
                resource.hasPassword(), resource.configured() ? List.of("TEST", "CALL") : List.of(),
                "/tools/reqpool/resources?view=accounts&edit=" + resource.id())).toList();
    }

    @Override public Object execute(String resourceId, ResourceCall call) {
        return executor.execute(resources.required(resourceId), call);
    }

    private static String endpoint(String value) {
        URI uri = URI.create(value);
        return uri.getScheme() + "://" + uri.getAuthority();
    }
}
