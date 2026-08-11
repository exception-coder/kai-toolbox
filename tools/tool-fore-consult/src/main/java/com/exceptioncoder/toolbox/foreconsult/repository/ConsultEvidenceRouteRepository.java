package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultEvidenceRoute;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/** consult_evidence_route 的数据访问层。 */
@Repository
public class ConsultEvidenceRouteRepository {

    private static final RowMapper<ConsultEvidenceRoute> ROW = (rs, index) -> ConsultEvidenceRoute.builder()
            .id(rs.getString("id"))
            .contextSystem(rs.getString("context_system"))
            .moduleName(rs.getString("module_name"))
            .businessObject(rs.getString("business_object"))
            .keywords(rs.getString("keywords"))
            .evidenceSystem(rs.getString("evidence_system"))
            .schemaSource(rs.getString("schema_source"))
            .description(rs.getString("description"))
            .evidenceRefs(rs.getString("evidence_refs"))
            .status(rs.getString("status"))
            .source(rs.getString("source"))
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .confirmedAt(rs.getObject("confirmed_at") == null ? null : rs.getLong("confirmed_at"))
            .build();

    private final JdbcTemplate jdbc;

    public ConsultEvidenceRouteRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ConsultEvidenceRoute> findAll() {
        return jdbc.query("SELECT * FROM consult_evidence_route ORDER BY status ASC, updated_at DESC", ROW);
    }

    public Optional<ConsultEvidenceRoute> findById(String id) {
        return jdbc.query("SELECT * FROM consult_evidence_route WHERE id=?", ROW, id).stream().findFirst();
    }

    public List<ConsultEvidenceRoute> findConfirmedByContextSystem(String contextSystem) {
        return jdbc.query("SELECT * FROM consult_evidence_route "
                        + "WHERE LOWER(context_system)=LOWER(?) AND status='CONFIRMED' ORDER BY updated_at DESC",
                ROW, contextSystem);
    }

    public Optional<ConsultEvidenceRoute> findEquivalent(String contextSystem, String moduleName,
                                                          String businessObject, String evidenceSystem) {
        return jdbc.query("SELECT * FROM consult_evidence_route WHERE LOWER(context_system)=LOWER(?) "
                        + "AND LOWER(COALESCE(module_name,''))=LOWER(?) AND LOWER(business_object)=LOWER(?) "
                        + "AND LOWER(evidence_system)=LOWER(?) LIMIT 1",
                ROW, contextSystem, moduleName == null ? "" : moduleName, businessObject, evidenceSystem)
                .stream().findFirst();
    }

    public void insert(ConsultEvidenceRoute route) {
        jdbc.update("INSERT INTO consult_evidence_route (id,context_system,module_name,business_object,keywords,"
                        + "evidence_system,schema_source,description,evidence_refs,status,source,created_at,updated_at,confirmed_at) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                route.getId(), route.getContextSystem(), route.getModuleName(), route.getBusinessObject(),
                route.getKeywords(), route.getEvidenceSystem(), route.getSchemaSource(), route.getDescription(),
                route.getEvidenceRefs(), route.getStatus(), route.getSource(), route.getCreatedAt(),
                route.getUpdatedAt(), route.getConfirmedAt());
    }

    public void update(ConsultEvidenceRoute route) {
        jdbc.update("UPDATE consult_evidence_route SET context_system=?,module_name=?,business_object=?,keywords=?,"
                        + "evidence_system=?,schema_source=?,description=?,evidence_refs=?,status=?,source=?,updated_at=?,"
                        + "confirmed_at=? WHERE id=?",
                route.getContextSystem(), route.getModuleName(), route.getBusinessObject(), route.getKeywords(),
                route.getEvidenceSystem(), route.getSchemaSource(), route.getDescription(), route.getEvidenceRefs(),
                route.getStatus(), route.getSource(), route.getUpdatedAt(), route.getConfirmedAt(), route.getId());
    }

    public void delete(String id) {
        jdbc.update("DELETE FROM consult_evidence_route WHERE id=?", id);
    }
}
