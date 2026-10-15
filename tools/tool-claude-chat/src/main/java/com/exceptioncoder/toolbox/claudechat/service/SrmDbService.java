package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ErpDbQueryResult;
import org.springframework.stereotype.Service;
import java.util.List;

/** 保留旧HTTP契约用于提示迁移，不再读取独立配置或建立数据库连接。 */
@Service
public class SrmDbService {
    private static final String MIGRATION_REQUIRED = "旧版数据库连接执行入口已停用。请到系统资源绑定测试数据库，"
            + "并在Agent管理的业务咨询流程节点选择数据库资源后发布；仅修改旧配置不生效。";

    public String test() { return MIGRATION_REQUIRED; }

    public ErpDbQueryResult query(String sql, List<Object> params) {
        return ErpDbQueryResult.err(MIGRATION_REQUIRED);
    }
}
