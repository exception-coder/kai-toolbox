package com.exceptioncoder.toolbox.ops.resources.infrastructure;

import com.exceptioncoder.toolbox.ops.resources.domain.ApplicationResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class JdbcApplicationResourceRepository {
    private final JdbcTemplate jdbc;

    public JdbcApplicationResourceRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<ApplicationResource> findAll() {
        return jdbc.query("SELECT * FROM ops_application_resource ORDER BY name,id", (row, index) -> map(row));
    }

    public Optional<ApplicationResource> findById(String id) {
        return jdbc.query("SELECT * FROM ops_application_resource WHERE id=?", (row, index) -> map(row), id)
                .stream().findFirst();
    }

    public void insert(ApplicationResource value) {
        jdbc.update("""
                INSERT INTO ops_application_resource
                (id,name,environment,base_url,auth_type,login_path,username,password,username_field,
                 password_field,token_json_path,tenant_header,tenant_value,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, value.id(), value.name(), value.environment(), value.baseUrl(), value.authType().name(),
                value.loginPath(), value.username(), value.password(), value.usernameField(), value.passwordField(),
                value.tokenJsonPath(), value.tenantHeader(), value.tenantValue(), value.createdAt(), value.updatedAt());
    }

    public void update(ApplicationResource value) {
        jdbc.update("""
                UPDATE ops_application_resource SET name=?,environment=?,base_url=?,auth_type=?,login_path=?,
                username=?,password=?,username_field=?,password_field=?,token_json_path=?,tenant_header=?,
                tenant_value=?,updated_at=? WHERE id=?
                """, value.name(), value.environment(), value.baseUrl(), value.authType().name(), value.loginPath(),
                value.username(), value.password(), value.usernameField(), value.passwordField(), value.tokenJsonPath(),
                value.tenantHeader(), value.tenantValue(), value.updatedAt(), value.id());
    }

    public void delete(String id) { jdbc.update("DELETE FROM ops_application_resource WHERE id=?", id); }

    private static ApplicationResource map(java.sql.ResultSet row) throws java.sql.SQLException {
        return new ApplicationResource(row.getString("id"), row.getString("name"), row.getString("environment"),
                row.getString("base_url"), ApplicationResource.AuthType.valueOf(row.getString("auth_type")),
                row.getString("login_path"), row.getString("username"), row.getString("password"),
                row.getString("username_field"), row.getString("password_field"), row.getString("token_json_path"),
                row.getString("tenant_header"), row.getString("tenant_value"), row.getLong("created_at"),
                row.getLong("updated_at"));
    }
}
