package com.exceptioncoder.toolbox.welfaresign.repository;

import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.ConfigRequest;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.ConfigView;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.EmployeeRequest;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.EmployeeView;
import com.exceptioncoder.toolbox.welfaresign.api.dto.WelfareSignDtos.SignRecordView;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Repository
public class WelfareSignRepository {
    private final JdbcTemplate jdbc;

    public WelfareSignRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public ConfigView config() {
        List<ConfigView> rows = jdbc.query("SELECT * FROM welfare_sign_config WHERE id = 1", CONFIG_ROW);
        if (!rows.isEmpty()) return rows.getFirst();
        long now = System.currentTimeMillis();
        jdbc.update("""
                INSERT INTO welfare_sign_config
                  (id, login_mode, detail_title, detail_content, signature_notice, updated_at)
                VALUES (1, 'SMS', '端午安康', '粽叶飘香，端午将至，一份来自公司的心意已为你备好。请确认收取，并留下你的签名。', '本人确认已收到本次端午节福利品。', ?)
                """, now);
        return jdbc.query("SELECT * FROM welfare_sign_config WHERE id = 1", CONFIG_ROW).getFirst();
    }

    public ConfigView updateConfig(ConfigRequest r, long now) {
        jdbc.update("""
                INSERT INTO welfare_sign_config
                  (id, login_mode, redirect_url, login_image_url, detail_image_url, detail_title, detail_content,
                   popup_enabled, popup_title, popup_content, signature_notice, extra_fields_json, updated_at)
                VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  login_mode = excluded.login_mode,
                  redirect_url = excluded.redirect_url,
                  login_image_url = excluded.login_image_url,
                  detail_image_url = excluded.detail_image_url,
                  detail_title = excluded.detail_title,
                  detail_content = excluded.detail_content,
                  popup_enabled = excluded.popup_enabled,
                  popup_title = excluded.popup_title,
                  popup_content = excluded.popup_content,
                  signature_notice = excluded.signature_notice,
                  extra_fields_json = excluded.extra_fields_json,
                  updated_at = excluded.updated_at
                """,
                normLoginMode(r.loginMode()), blank(r.redirectUrl()), blank(r.loginImageUrl()), blank(r.detailImageUrl()),
                blank(r.detailTitle()) == null ? "端午安康" : r.detailTitle().trim(),
                blank(r.detailContent()), r.popupEnabled() ? 1 : 0, blank(r.popupTitle()), blank(r.popupContent()),
                blank(r.signatureNotice()), blank(r.extraFieldsJson()), now);
        return config();
    }

    public List<EmployeeView> employees() {
        return jdbc.query("""
                SELECT e.*,
                       CASE WHEN r.id IS NULL THEN 0 ELSE 1 END AS signed,
                       r.signed_at AS signed_at
                FROM welfare_sign_employee e
                LEFT JOIN welfare_sign_record r ON r.employee_id = e.id
                ORDER BY e.enabled DESC, e.department ASC, e.employee_no ASC
                """, EMPLOYEE_ROW);
    }

    public Optional<EmployeeView> employee(long id) {
        return jdbc.query("""
                SELECT e.*,
                       CASE WHEN r.id IS NULL THEN 0 ELSE 1 END AS signed,
                       r.signed_at AS signed_at
                FROM welfare_sign_employee e
                LEFT JOIN welfare_sign_record r ON r.employee_id = e.id
                WHERE e.id = ?
                """, EMPLOYEE_ROW, id).stream().findFirst();
    }

    public Optional<EmployeeView> findForSmsLogin(String loginId) {
        return jdbc.query("""
                SELECT e.*,
                       CASE WHEN r.id IS NULL THEN 0 ELSE 1 END AS signed,
                       r.signed_at AS signed_at
                FROM welfare_sign_employee e
                LEFT JOIN welfare_sign_record r ON r.employee_id = e.id
                WHERE e.enabled = 1 AND (e.phone = ? OR e.employee_no = ?)
                LIMIT 1
                """, EMPLOYEE_ROW, loginId, loginId).stream().findFirst();
    }

    public Optional<EmployeeView> findForAccountLogin(String loginId, String password) {
        return jdbc.query("""
                SELECT e.*,
                       CASE WHEN r.id IS NULL THEN 0 ELSE 1 END AS signed,
                       r.signed_at AS signed_at
                FROM welfare_sign_employee e
                LEFT JOIN welfare_sign_record r ON r.employee_id = e.id
                WHERE e.enabled = 1 AND (e.account = ? OR e.employee_no = ?) AND COALESCE(e.password, '') = ?
                LIMIT 1
                """, EMPLOYEE_ROW, loginId, loginId, password == null ? "" : password).stream().findFirst();
    }

    public EmployeeView createEmployee(EmployeeRequest r, long now) {
        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO welfare_sign_employee
                      (employee_no, name, phone, account, password, department, extra_json, enabled, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            bindEmployee(ps, r, now, true);
            return ps;
        }, kh);
        long id = Objects.requireNonNull(kh.getKey(), "generated key missing").longValue();
        return employee(id).orElseThrow();
    }

    public EmployeeView updateEmployee(long id, EmployeeRequest r, long now) {
        jdbc.update("""
                UPDATE welfare_sign_employee
                SET employee_no = ?, name = ?, phone = ?, account = ?, password = COALESCE(?, password), department = ?,
                    extra_json = ?, enabled = ?, updated_at = ?
                WHERE id = ?
                """, required(r.employeeNo(), "employeeNo"), required(r.name(), "name"), blank(r.phone()),
                blank(r.account()), blank(r.password()), blank(r.department()), blank(r.extraJson()),
                r.enabled() ? 1 : 0, now, id);
        return employee(id).orElseThrow();
    }

    public void deleteEmployee(long id) {
        jdbc.update("DELETE FROM welfare_sign_record WHERE employee_id = ?", id);
        jdbc.update("DELETE FROM welfare_sign_employee WHERE id = ?", id);
    }

    public void upsertRecord(EmployeeView e, String signatureData, String extraJson, long signedAt, String ip, String userAgent) {
        jdbc.update("""
                INSERT INTO welfare_sign_record
                  (employee_id, employee_no, name, phone, department, signature_data, extra_json, signed_at, ip, user_agent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(employee_id) DO UPDATE SET
                  employee_no = excluded.employee_no,
                  name = excluded.name,
                  phone = excluded.phone,
                  department = excluded.department,
                  signature_data = excluded.signature_data,
                  extra_json = excluded.extra_json,
                  signed_at = excluded.signed_at,
                  ip = excluded.ip,
                  user_agent = excluded.user_agent
                """, e.id(), e.employeeNo(), e.name(), e.phone(), e.department(), signatureData, extraJson, signedAt, ip, userAgent);
    }

    public List<SignRecordView> records() {
        return jdbc.query("SELECT * FROM welfare_sign_record ORDER BY signed_at DESC", RECORD_ROW);
    }

    private static void bindEmployee(PreparedStatement ps, EmployeeRequest r, long now, boolean insert) throws java.sql.SQLException {
        ps.setString(1, required(r.employeeNo(), "employeeNo"));
        ps.setString(2, required(r.name(), "name"));
        ps.setString(3, blank(r.phone()));
        ps.setString(4, blank(r.account()));
        ps.setString(5, blank(r.password()));
        ps.setString(6, blank(r.department()));
        ps.setString(7, blank(r.extraJson()));
        ps.setInt(8, r.enabled() ? 1 : 0);
        if (insert) {
            ps.setLong(9, now);
            ps.setLong(10, now);
        }
    }

    private static String required(String value, String field) {
        String v = blank(value);
        if (v == null) throw new IllegalArgumentException(field + " is required");
        return v;
    }

    private static String blank(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String normLoginMode(String value) {
        return "PASSWORD".equalsIgnoreCase(value) ? "PASSWORD" : "SMS";
    }

    private static final RowMapper<ConfigView> CONFIG_ROW = (rs, i) -> new ConfigView(
            rs.getString("login_mode"),
            rs.getString("redirect_url"),
            rs.getString("login_image_url"),
            rs.getString("detail_image_url"),
            rs.getString("detail_title"),
            rs.getString("detail_content"),
            rs.getInt("popup_enabled") == 1,
            rs.getString("popup_title"),
            rs.getString("popup_content"),
            rs.getString("signature_notice"),
            rs.getString("extra_fields_json"),
            rs.getLong("updated_at")
    );

    private static final RowMapper<EmployeeView> EMPLOYEE_ROW = (rs, i) -> new EmployeeView(
            rs.getLong("id"),
            rs.getString("employee_no"),
            rs.getString("name"),
            rs.getString("phone"),
            rs.getString("account"),
            rs.getString("department"),
            rs.getString("extra_json"),
            rs.getInt("enabled") == 1,
            rs.getLong("created_at"),
            rs.getLong("updated_at"),
            rs.getInt("signed") == 1,
            rs.getObject("signed_at") == null ? null : rs.getLong("signed_at")
    );

    private static final RowMapper<SignRecordView> RECORD_ROW = (rs, i) -> new SignRecordView(
            rs.getLong("id"),
            rs.getLong("employee_id"),
            rs.getString("employee_no"),
            rs.getString("name"),
            rs.getString("phone"),
            rs.getString("department"),
            rs.getString("signature_data"),
            rs.getString("extra_json"),
            rs.getLong("signed_at"),
            rs.getString("ip"),
            rs.getString("user_agent")
    );
}
