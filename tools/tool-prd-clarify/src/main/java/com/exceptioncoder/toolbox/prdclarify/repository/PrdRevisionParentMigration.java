package com.exceptioncoder.toolbox.prdclarify.repository;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.DependsOn;
import org.springframework.stereotype.Component;

/** 为 parent_id 功能上线前已生成的修订版补齐父子关系。 */
@Component
@DependsOn("schemaInitializer")
public class PrdRevisionParentMigration {

    private static final Logger log = LoggerFactory.getLogger(PrdRevisionParentMigration.class);

    private final PrdSessionRepository repo;

    public PrdRevisionParentMigration(PrdSessionRepository repo) {
        this.repo = repo;
    }

    @PostConstruct
    public void migrate() {
        int updated = repo.backfillRevisionParents();
        if (updated > 0) {
            log.info("[prd-clarify] migration: 已为 {} 条存量修订版补齐父 PRD 关系", updated);
        }
    }
}
