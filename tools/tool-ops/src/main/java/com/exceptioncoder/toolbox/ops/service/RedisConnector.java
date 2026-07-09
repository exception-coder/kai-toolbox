package com.exceptioncoder.toolbox.ops.service;

import com.exceptioncoder.toolbox.ops.api.dto.RedisExecResult;
import com.exceptioncoder.toolbox.ops.api.dto.TestResult;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import org.springframework.stereotype.Component;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.commands.ProtocolCommand;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Redis 查询：从 {@link OpsDataSourcePool} 借 Jedis 连接，用完归还（JedisPool 复用）。
 */
@Component
public class RedisConnector {

    private final OpsDataSourcePool pool;

    public RedisConnector(OpsDataSourcePool pool) {
        this.pool = pool;
    }

    public TestResult test(OpsDatasource ds) {
        long start = System.currentTimeMillis();
        try (Jedis jedis = pool.borrowRedis(ds)) {
            String pong = jedis.ping();
            int db = dbIndex(ds);
            return new TestResult(true, pong + " (db " + db + ")", System.currentTimeMillis() - start);
        } catch (Exception e) {
            return new TestResult(false, rootMessage(e), System.currentTimeMillis() - start);
        }
    }

    public RedisExecResult exec(OpsDatasource ds, String commandLine) {
        long start = System.currentTimeMillis();
        List<String> tokens = tokenize(commandLine);
        if (tokens.isEmpty()) throw new IllegalArgumentException("命令为空");
        String cmd  = tokens.get(0).toUpperCase();
        String[] args = tokens.subList(1, tokens.size()).toArray(new String[0]);
        try (Jedis jedis = pool.borrowRedis(ds)) {
            ProtocolCommand pc = () -> cmd.getBytes(StandardCharsets.UTF_8);
            Object raw = jedis.sendCommand(pc, args);
            return new RedisExecResult(commandLine.trim(), convert(raw), System.currentTimeMillis() - start);
        }
    }

    private static int dbIndex(OpsDatasource ds) {
        String db = ds.getDbName();
        if (db == null || db.isBlank()) return 0;
        try { return Integer.parseInt(db.trim()); } catch (NumberFormatException e) { return 0; }
    }

    @SuppressWarnings("unchecked")
    private static Object convert(Object raw) {
        if (raw == null) return null;
        if (raw instanceof byte[] b) return new String(b, StandardCharsets.UTF_8);
        if (raw instanceof Long || raw instanceof Double || raw instanceof Boolean) return raw;
        if (raw instanceof List<?> list) {
            List<Object> out = new ArrayList<>(list.size());
            for (Object item : list) out.add(convert(item));
            return out;
        }
        return String.valueOf(raw);
    }

    /** 极简分词：空白分隔，支持双引号包裹含空格的段。 */
    static List<String> tokenize(String line) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean inQuote = false;
        boolean has = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                inQuote = !inQuote; has = true;
            } else if (Character.isWhitespace(c) && !inQuote) {
                if (has) { out.add(cur.toString()); cur.setLength(0); has = false; }
            } else {
                cur.append(c); has = true;
            }
        }
        if (has) out.add(cur.toString());
        return out;
    }

    private static String rootMessage(Throwable e) {
        Throwable cur = e;
        while (cur.getCause() != null && cur.getCause() != cur) cur = cur.getCause();
        String msg = cur.getMessage();
        return msg == null || msg.isBlank() ? cur.getClass().getSimpleName() : msg;
    }
}
