package com.exceptioncoder.toolbox.prdclarify.service;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;
import java.nio.file.Files;
import java.nio.file.Path;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceScopeResolver;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
class PrdDdlContextServiceTest {
    @Test
    void onlyReadsProjectSqlNotHistoricalMarkdown(@TempDir Path root) throws Exception {
        Path old = root.resolve("docs/domain/impl/ddl-baseline.md");
        Files.createDirectories(old.getParent());
        Files.writeString(old, "CREATE TABLE old_table(id TEXT);");
        var service = new PrdDdlContextService(new MockEnvironment()
            .withProperty("toolbox.knowledge-graph.domain-knowledge-repo-path", root.toString()));
        service.setScopes(scopes(root));
        assertThat(service.query("demo", null, "table", null)).isNull();
        Path schema = root.resolve("db/schema.sql");
        Files.createDirectories(schema.getParent());
        Files.writeString(schema, "CREATE TABLE current_table(id TEXT);");
        assertThat(service.query("demo", null, "table", null))
            .contains("current_table", "未核验数据库部署版本").doesNotContain("old_table");
        assertThat(service.query("other", null, "table", null)).isNull();
    }
    private ProjectEvidenceScopeResolver scopes(Path root) {
        var resolver = mock(ProjectEvidenceScopeResolver.class, RETURNS_DEEP_STUBS);
        when(resolver.resolve("demo").primary().projectPath()).thenReturn(root.toString());
        when(resolver.resolve("other")).thenThrow(new IllegalArgumentException("not authorized"));
        return resolver;
    }
}
