package com.exceptioncoder.toolbox.prdclarify.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class PrdDdlContextServiceTest {

    @Test
    void shouldSelectOnlyDdlRelatedToRequirementEvidence(@TempDir Path tempDir) throws Exception {
        Path repo = createBaseline(tempDir, "demo-project", """
                # DDL 基线 · demo

                ## order_header
                ```sql
                CREATE TABLE order_header (id TEXT PRIMARY KEY, status TEXT);
                ```

                ## audit_log
                ```sql
                CREATE TABLE audit_log (id TEXT PRIMARY KEY, content TEXT);
                ```
                """);
        PrdDdlContextService service = service(repo);

        String result = service.query(
                "DEMO-PROJECT", "订单", "支持订单取消", "OrderService writes order_header");

        assertThat(result)
                .contains("DDL 基线：")
                .contains("CREATE TABLE order_header")
                .doesNotContain("CREATE TABLE audit_log");
    }

    @Test
    void shouldExplainWhenBaselineExistsButNoTableMatches(@TempDir Path tempDir) throws Exception {
        Path repo = createBaseline(tempDir, "demo-project", """
                # DDL 基线 · demo

                ## audit_log
                ```sql
                CREATE TABLE audit_log (id TEXT PRIMARY KEY);
                ```
                """);
        PrdDdlContextService service = service(repo);

        String result = service.query("demo-project", "库存", "增加库存预警", "StockWarningService");

        assertThat(result).contains("未从当前需求和图谱证据中匹配到关键表");
    }

    @Test
    void shouldReturnNullWhenProjectHasNoDdlBaseline(@TempDir Path tempDir) {
        PrdDdlContextService service = service(tempDir);

        assertThat(service.query("missing", "module", "question", "evidence")).isNull();
    }

    private static Path createBaseline(Path tempDir, String project, String content) throws Exception {
        Path repo = Files.createDirectories(tempDir.resolve("domain-knowledge"));
        Path baseline = repo.resolve("knowledge").resolve(project).resolve("impl").resolve("ddl-baseline.md");
        Files.createDirectories(baseline.getParent());
        Files.writeString(baseline, content);
        return repo;
    }

    private static PrdDdlContextService service(Path repo) {
        MockEnvironment environment = new MockEnvironment()
                .withProperty("toolbox.knowledge-graph.domain-knowledge-repo-path", repo.toString());
        return new PrdDdlContextService(environment);
    }
}
