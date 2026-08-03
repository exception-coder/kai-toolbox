package com.exceptioncoder.toolbox.prdclarify.repository;

import jakarta.annotation.PostConstruct;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Set;
import java.util.stream.Collectors;

/** 为存量文档变更候选补齐差异账本、门禁结论和复核时间。 */
@Component
@DependsOn("schemaInitializer")
public class PrdDocChangeLedgerMigration {
    private final JdbcTemplate jdbc;

    public PrdDocChangeLedgerMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostConstruct
    public void migrate() {
        Set<String> columns = jdbc.queryForList("PRAGMA table_info(prd_doc_change_candidate)").stream()
                .map(row -> String.valueOf(row.get("name")))
                .collect(Collectors.toSet());
        if (!columns.contains("diff_ledger_json")) {
            jdbc.execute("ALTER TABLE prd_doc_change_candidate ADD COLUMN diff_ledger_json TEXT NOT NULL DEFAULT '[]'");
        }
        if (!columns.contains("alignment_conclusion_json")) {
            jdbc.execute("ALTER TABLE prd_doc_change_candidate ADD COLUMN alignment_conclusion_json TEXT NOT NULL DEFAULT '{}'");
        }
        if (!columns.contains("verified_at")) {
            jdbc.execute("ALTER TABLE prd_doc_change_candidate ADD COLUMN verified_at INTEGER");
        }
    }
}
