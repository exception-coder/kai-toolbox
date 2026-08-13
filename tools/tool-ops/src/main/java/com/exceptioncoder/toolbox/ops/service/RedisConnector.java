package com.exceptioncoder.toolbox.ops.service;

import com.exceptioncoder.toolbox.ops.api.dto.RedisExecResult;
import com.exceptioncoder.toolbox.ops.api.dto.RedisKeyDeleteResult;
import com.exceptioncoder.toolbox.ops.api.dto.RedisPatternDeleteResult;
import com.exceptioncoder.toolbox.ops.api.dto.TestResult;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import org.springframework.stereotype.Component;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.commands.ProtocolCommand;
import redis.clients.jedis.params.ScanParams;
import redis.clients.jedis.resps.ScanResult;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Redis 查询：从 {@link OpsDataSourcePool} 借 Jedis 连接，用完归还（JedisPool 复用）。
 */
@Component
public class RedisConnector {

    private static final int SCAN_COUNT = 200;
    private static final int DELETE_BATCH_SIZE = 200;

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

    /**
     * 使用 SCAN 收集匹配键，再以小批量 DEL 删除，避免阻塞 Redis 或误用全库清理命令。
     * 模式必须先经过 {@link RedisKeyPatternPolicy} 校验。
     */
    public RedisKeyDeleteResult deleteByPatterns(OpsDatasource ds, List<String> patterns) {
        long start = System.currentTimeMillis();
        List<RedisPatternDeleteResult> patternResults = new ArrayList<>(patterns.size());
        long totalDeleted = 0;

        try (Jedis jedis = pool.borrowRedis(ds)) {
            for (String pattern : patterns) {
                long deleted = deleteByPattern(jedis, pattern);
                patternResults.add(new RedisPatternDeleteResult(pattern, deleted));
                totalDeleted += deleted;
            }
        }
        return new RedisKeyDeleteResult(List.copyOf(patternResults), totalDeleted,
                System.currentTimeMillis() - start);
    }

    private static long deleteByPattern(Jedis jedis, String pattern) {
        Set<String> keys = new LinkedHashSet<>();
        ScanParams params = new ScanParams().match(pattern).count(SCAN_COUNT);
        String cursor = ScanParams.SCAN_POINTER_START;
        do {
            ScanResult<String> result = jedis.scan(cursor, params);
            cursor = result.getCursor();
            keys.addAll(result.getResult());
        } while (!ScanParams.SCAN_POINTER_START.equals(cursor));

        if (keys.isEmpty()) {
            return 0;
        }
        List<String> keyList = List.copyOf(keys);
        long deleted = 0;
        for (int from = 0; from < keyList.size(); from += DELETE_BATCH_SIZE) {
            int to = Math.min(from + DELETE_BATCH_SIZE, keyList.size());
            deleted += jedis.del(keyList.subList(from, to).toArray(String[]::new));
        }
        return deleted;
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
