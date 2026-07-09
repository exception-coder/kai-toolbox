package com.exceptioncoder.toolbox.ops.service;

import com.exceptioncoder.toolbox.ops.api.dto.DatasourceRequest;
import com.exceptioncoder.toolbox.ops.domain.DatasourceType;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import com.exceptioncoder.toolbox.ops.repository.DatasourceRepository;
import com.exceptioncoder.toolbox.ops.repository.QueryHistoryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class OpsDatasourceService {

    private final DatasourceRepository datasources;
    private final QueryHistoryRepository histories;
    private final OpsDataSourcePool pool;

    public OpsDatasourceService(DatasourceRepository datasources, QueryHistoryRepository histories,
                                OpsDataSourcePool pool) {
        this.datasources = datasources;
        this.histories   = histories;
        this.pool        = pool;
    }

    public List<OpsDatasource> findAll() {
        return datasources.findAll();
    }

    public List<OpsDatasource> findBySystem(String systemId) {
        return datasources.findBySystem(systemId);
    }

    public OpsDatasource findRequired(String id) {
        return datasources.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("datasource not found: " + id));
    }

    public OpsDatasource create(DatasourceRequest req) {
        long now = System.currentTimeMillis();
        DatasourceType type = parseType(req.type());
        OpsDatasource d = OpsDatasource.builder()
                .id(UUID.randomUUID().toString())
                .systemId(req.systemId())
                .env(req.env().trim().toUpperCase())
                .type(type)
                .name(req.name().trim())
                .host(req.host().trim())
                .port(req.port() == null ? type.defaultPort() : req.port())
                .username(blankToNull(req.username()))
                .password(blankToNull(req.password()))
                .dbName(blankToNull(req.dbName()))
                .params(blankToNull(req.params()))
                .note(blankToNull(req.note()))
                .sortOrder(req.sortOrder() == null ? 0 : req.sortOrder())
                .createdAt(now)
                .updatedAt(now)
                .build();
        datasources.insert(d);
        return d;
    }

    public OpsDatasource update(String id, DatasourceRequest req) {
        OpsDatasource existing = findRequired(id);
        DatasourceType type = parseType(req.type());
        existing.setSystemId(req.systemId());
        existing.setEnv(req.env().trim().toUpperCase());
        existing.setType(type);
        existing.setName(req.name().trim());
        existing.setHost(req.host().trim());
        existing.setPort(req.port() == null ? type.defaultPort() : req.port());
        existing.setUsername(blankToNull(req.username()));
        // 密码留空 => 保持原值
        existing.setPassword(keepIfBlank(req.password(), existing.getPassword()));
        existing.setDbName(blankToNull(req.dbName()));
        existing.setParams(blankToNull(req.params()));
        existing.setNote(blankToNull(req.note()));
        existing.setSortOrder(req.sortOrder() == null ? existing.getSortOrder() : req.sortOrder());
        existing.setUpdatedAt(System.currentTimeMillis());
        datasources.update(existing);
        pool.invalidate(id);
        return existing;
    }

    @Transactional
    public void delete(String id) {
        pool.invalidate(id);
        histories.deleteByDatasource(id);
        datasources.deleteById(id);
    }

    private static DatasourceType parseType(String raw) {
        try {
            return DatasourceType.valueOf(raw.trim().toUpperCase());
        } catch (Exception e) {
            throw new IllegalArgumentException("不支持的中间件类型: " + raw);
        }
    }

    private static String keepIfBlank(String candidate, String existing) {
        if (candidate == null) return existing;
        String trimmed = candidate.trim();
        return trimmed.isEmpty() ? existing : trimmed;
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }
}
