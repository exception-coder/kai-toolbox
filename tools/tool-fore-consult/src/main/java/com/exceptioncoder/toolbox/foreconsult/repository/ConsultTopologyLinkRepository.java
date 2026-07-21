package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultTopologyLink;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * consult_topology_link 表的数据访问层。全局单份拓扑，整表替换式写入。
 */
@Repository
public class ConsultTopologyLinkRepository {

    private static final RowMapper<ConsultTopologyLink> ROW = (rs, i) -> ConsultTopologyLink.builder()
            .fromSystem(rs.getString("from_system"))
            .toSystem(rs.getString("to_system"))
            .relation(rs.getString("relation"))
            .description(rs.getString("description"))
            .createdAt(rs.getLong("created_at"))
            .build();

    private final JdbcTemplate jdbc;

    public ConsultTopologyLinkRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ConsultTopologyLink> findAll() {
        return jdbc.query("SELECT * FROM consult_topology_link ORDER BY from_system ASC, to_system ASC", ROW);
    }

    /** 整表替换：先清空，再写入本次分析的全部边。 */
    public void replaceAll(List<ConsultTopologyLink> links) {
        jdbc.update("DELETE FROM consult_topology_link");
        for (ConsultTopologyLink l : links) {
            jdbc.update(
                    "INSERT INTO consult_topology_link (from_system, to_system, relation, description, created_at) " +
                    "VALUES (?, ?, ?, ?, ?)",
                    l.getFromSystem(), l.getToSystem(), l.getRelation(), l.getDescription(), l.getCreatedAt());
        }
    }
}
