package com.exceptioncoder.toolbox.ops.resources.infrastructure;

import com.exceptioncoder.toolbox.ops.resources.domain.ResourceBinding;
import com.exceptioncoder.toolbox.ops.resources.domain.ResourceBindingStore;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.List;

/** 关系独立存储；解绑不会删除源资源。 */
@Repository
public class JdbcResourceBindingStore implements ResourceBindingStore {
    private final JdbcTemplate jdbc;
    public JdbcResourceBindingStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override
    public List<ResourceBinding> list() {
        return jdbc.query("SELECT id,system_id,provider_id,resource_id,purpose,enabled FROM ops_resource_binding ORDER BY system_id,id",
                (row, index) -> new ResourceBinding(row.getString("id"), row.getString("system_id"),
                        row.getString("provider_id"), row.getString("resource_id"),
                        row.getString("purpose"), row.getBoolean("enabled")));
    }

    @Override
    public void save(ResourceBinding binding) {
        jdbc.update("""
                INSERT INTO ops_resource_binding(id,system_id,provider_id,resource_id,purpose,enabled)
                VALUES (?,?,?,?,?,?) ON CONFLICT(system_id,provider_id,resource_id)
                DO UPDATE SET purpose=excluded.purpose,enabled=excluded.enabled
                """, binding.id(), binding.systemId(), binding.providerId(), binding.resourceId(),
                binding.purpose(), binding.enabled());
    }

    @Override
    public void delete(String id) { jdbc.update("DELETE FROM ops_resource_binding WHERE id=?", id); }
}
