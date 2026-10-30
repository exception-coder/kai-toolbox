package com.exceptioncoder.toolbox.foreconsult.repository;

import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Owns durable external request identity; execution receipts remain owned by the chat runtime. */
@Repository
public class ConsultClientRequestRepository {

    private final JdbcTemplate jdbc;

    public ConsultClientRequestRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Saved(String consultationId, String hash, String prompt) {}

    public Optional<Saved> find(String user, String request) {
        return jdbc
            .query(
                "SELECT consultation_id,input_hash,prepared_prompt FROM consult_client_request WHERE user_id=? AND request_id=?",
                (rs, row) ->
                    new Saved(
                        rs.getString(1),
                        rs.getString(2),
                        rs.getString(3)
                    ),
                user,
                request
            )
            .stream()
            .findFirst();
    }

    public void save(
        String user,
        String request,
        String consultation,
        String hash,
        String prompt
    ) {
        jdbc.update(
            "INSERT INTO consult_client_request(user_id,request_id,consultation_id,input_hash,prepared_prompt,created_at) VALUES (?,?,?,?,?,?)",
            user,
            request,
            consultation,
            hash,
            prompt,
            System.currentTimeMillis()
        );
    }
}
