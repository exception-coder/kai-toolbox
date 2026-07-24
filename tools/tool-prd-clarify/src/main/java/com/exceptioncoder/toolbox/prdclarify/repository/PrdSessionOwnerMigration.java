package com.exceptioncoder.toolbox.prdclarify.repository;

import com.exceptioncoder.toolbox.common.auth.domain.AuthUser;
import com.exceptioncoder.toolbox.common.auth.repository.AuthUserRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.DependsOn;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * 一次性存量数据回填：给「关联当前登录用户」功能上线前创建的 prd_session 老记录（此时还没有
 * {@code created_by_user_id} 列）统一补上归属，按用户要求默认回填成 admin 账号。
 *
 * <p>不能把这条 UPDATE 直接写进 {@code prd-schema.sql}：{@code SchemaInitializer} 跨模块扫描
 * {@code classpath*:db/*-schema.sql} 不保证各模块建表顺序，若 prd-schema.sql 先于
 * toolbox-common 的 auth-schema.sql 执行，引用 auth_user 表的语句会直接报错，非幂等异常会
 * 中断 {@code SchemaInitializer} 的 {@code @PostConstruct}，导致整个应用启动失败。改为
 * {@code @DependsOn("schemaInitializer")} 的独立组件，保证所有模块的表（含 auth_user 和
 * 补完列后的 prd_session）都已建好之后再跑，用法对齐同类先例
 * {@code tool-visitor-analysis} 的 {@code CustomerRefMigration} / {@code tool-treesize} 的
 * {@code TreeSizeMigration}。</p>
 *
 * <p>幂等：每次启动都会跑，但只处理 {@code created_by_user_id IS NULL} 的行，回填一次后
 * 后续启动直接 0 行命中，是安全的空操作。</p>
 */
@Component
@DependsOn("schemaInitializer")
public class PrdSessionOwnerMigration {

    private static final Logger log = LoggerFactory.getLogger(PrdSessionOwnerMigration.class);

    /** 回填目标用户名。用户明确要求"默认补上 admin 用户"，故直接按用户名查找，不读可配置的
     *  bootstrap-admin-username（那是首次建号用的，跟这里"回填成哪个账号"是两件事）。 */
    private static final String BACKFILL_USERNAME = "admin";

    private final PrdSessionRepository repo;
    /** Optional：toolbox.auth.enabled=false 时 AuthUserRepository 这个 bean 根本不存在，
     *  不能硬依赖，否则鉴权关闭时本组件会直接装配失败拖垮整个应用启动。 */
    private final Optional<AuthUserRepository> authUserRepo;

    public PrdSessionOwnerMigration(PrdSessionRepository repo, Optional<AuthUserRepository> authUserRepo) {
        this.repo = repo;
        this.authUserRepo = authUserRepo;
    }

    @PostConstruct
    public void migrate() {
        long missing = repo.countMissingOwner();
        if (missing == 0) {
            log.debug("[prd-clarify] migration: 无待回填记录，跳过");
            return;
        }
        if (authUserRepo.isEmpty()) {
            log.info("[prd-clarify] migration: 鉴权模块未启用（toolbox.auth.enabled=false），"
                    + "{} 条存量记录暂不回填归属", missing);
            return;
        }
        Optional<AuthUser> admin = authUserRepo.get().findByUsername(BACKFILL_USERNAME);
        if (admin.isEmpty()) {
            log.warn("[prd-clarify] migration: 未找到用户名为 '{}' 的账号，{} 条存量记录暂不回填归属",
                    BACKFILL_USERNAME, missing);
            return;
        }
        int updated = repo.backfillOwner(admin.get().getId());
        log.info("[prd-clarify] migration: 已把 {} 条存量 PRD 会话回填归属到用户 '{}'（id={}）",
                updated, BACKFILL_USERNAME, admin.get().getId());
    }
}
