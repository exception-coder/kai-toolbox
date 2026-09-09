package com.exceptioncoder.forge.quality.runtime;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Executes read-only SQL against the configured real database. */
public final class SqlRuntimeVerifier implements RuntimeVerifier {
    private static final String RULE_ID = "SQL-RUNTIME-001";
    private static final int DEFAULT_TIMEOUT_SECONDS = 10;
    private static final Pattern MUTATION = Pattern.compile("\\b(INSERT|UPDATE|DELETE|MERGE|CALL|EXEC|CREATE|ALTER|DROP|TRUNCATE)\\b");

    @Override
    public String id() {
        return RULE_ID;
    }

    @Override
    public boolean supports(String scenarioType) {
        return "sql".equalsIgnoreCase(scenarioType);
    }

    @Override
    public RuntimeVerificationResult verify(RuntimeScenario scenario) {
        Instant startedAt = Instant.now();
        ScenarioConfiguration configuration = new ScenarioConfiguration(scenario);
        String sql = configuration.requiredText("sql").trim();
        validateReadOnly(sql);
        String jdbcUrl = configuration.requiredText("jdbcUrl");
        String username = configuration.environmentValue("usernameEnv");
        String password = configuration.environmentValue("passwordEnv");
        int timeout = configuration.optionalInteger("timeoutSeconds", DEFAULT_TIMEOUT_SECONDS);
        List<Object> parameters = configuration.optionalList("params");
        try (Connection connection = openConnection(jdbcUrl, username, password)) {
            connection.setReadOnly(true);
            connection.setAutoCommit(false);
            int rows = execute(connection, sql, parameters, timeout);
            connection.rollback();
            return result(scenario, RuntimeStatus.PASSED, startedAt,
                    "SQL prepared, bound, and executed successfully", "rowsObserved=" + rows);
        } catch (SQLException exception) {
            return result(scenario, RuntimeStatus.FAILED, startedAt,
                    "SQL execution failed: " + sanitized(exception.getMessage()),
                    "sqlState=" + safe(exception.getSQLState()) + ", vendorCode=" + exception.getErrorCode());
        }
    }

    private static Connection openConnection(String jdbcUrl, String username, String password) throws SQLException {
        if (username == null && password == null) {
            return DriverManager.getConnection(jdbcUrl);
        }
        return DriverManager.getConnection(jdbcUrl, username, password);
    }

    private static int execute(Connection connection, String sql, List<Object> parameters, int timeout)
            throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setQueryTimeout(timeout);
            for (int index = 0; index < parameters.size(); index++) {
                statement.setObject(index + 1, parameters.get(index));
            }
            try (ResultSet resultSet = statement.executeQuery()) {
                int rows = 0;
                while (rows < 100 && resultSet.next()) {
                    rows++;
                }
                return rows;
            }
        }
    }

    private static void validateReadOnly(String sql) {
        String normalized = sql.toUpperCase(Locale.ROOT);
        boolean supportedPrefix = normalized.startsWith("SELECT ") || normalized.startsWith("WITH ")
                || normalized.startsWith("EXPLAIN ");
        if (!supportedPrefix || sql.contains(";") || MUTATION.matcher(normalized).find()) {
            throw new IllegalArgumentException("Runtime SQL only permits one read-only SELECT, WITH, or EXPLAIN statement");
        }
    }

    private static RuntimeVerificationResult result(RuntimeScenario scenario, RuntimeStatus status,
                                                    Instant startedAt, String message, String evidence) {
        long duration = Duration.between(startedAt, Instant.now()).toMillis();
        return new RuntimeVerificationResult(RULE_ID, scenario.id(), scenario.type(), status,
                duration, message, evidence);
    }

    private static String sanitized(String message) {
        if (message == null || message.isBlank()) {
            return "database rejected the query";
        }
        return message.length() <= 500 ? message : message.substring(0, 500);
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}
