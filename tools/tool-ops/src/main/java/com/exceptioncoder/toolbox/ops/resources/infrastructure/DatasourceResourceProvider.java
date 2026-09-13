package com.exceptioncoder.toolbox.ops.resources.infrastructure;

import com.exceptioncoder.toolbox.common.resource.ResourceCall;
import com.exceptioncoder.toolbox.common.resource.ResourceDescriptor;
import com.exceptioncoder.toolbox.common.resource.ResourceProvider;
import com.exceptioncoder.toolbox.ops.domain.DatasourceType;
import com.exceptioncoder.toolbox.ops.service.OpsDatasourceService;
import com.exceptioncoder.toolbox.ops.service.OpsQueryService;
import org.springframework.stereotype.Component;
import java.util.List;

/** 数据源元信息及只读执行适配；连接配置始终由原模块持有。 */
@Component
public class DatasourceResourceProvider implements ResourceProvider {
    private final OpsDatasourceService sources;
    private final OpsQueryService queries;
    public DatasourceResourceProvider(OpsDatasourceService sources, OpsQueryService queries) {
        this.sources = sources; this.queries = queries;
    }
    @Override public String id() { return "datasource"; }

    @Override public List<ResourceDescriptor> resources() {
        return sources.findAll().stream().map(source -> new ResourceDescriptor(source.getId(), source.getName(),
                source.getType().name(), source.getEnv(), source.endpoint(), source.getUsername(),
                source.getPassword() != null && !source.getPassword().isBlank(),
                source.getType().category() == DatasourceType.Category.SQL ? List.of("TEST", "QUERY")
                        : source.getType().category() == DatasourceType.Category.REDIS ? List.of("TEST") : List.of(),
                "/tools/reqpool/resources?view=connections")).toList();
    }

    @Override public Object execute(String resourceId, ResourceCall call) {
        return switch (call.operation()) {
            case "TEST" -> queries.test(resourceId);
            case "QUERY" -> queries.readOnlySqlQuery(resourceId, call.sql(), 200);
            default -> throw new IllegalArgumentException("数据源不支持该操作");
        };
    }
}
