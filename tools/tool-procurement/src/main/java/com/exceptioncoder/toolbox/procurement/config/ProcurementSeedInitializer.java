package com.exceptioncoder.toolbox.procurement.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.exceptioncoder.toolbox.procurement.domain.ProcurementStore;
import com.exceptioncoder.toolbox.procurement.domain.ProcurementData.Rule;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.DependsOn;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Instant;

/** 首次导入在一个事务内完成；重启保留用户管理结果。 */
@Component
@DependsOn("schemaInitializer")
public class ProcurementSeedInitializer implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final TransactionTemplate transaction;
    private final ProcurementStore store;

    public ProcurementSeedInitializer(JdbcTemplate jdbc, ObjectMapper mapper,
                                     TransactionTemplate transaction, ProcurementStore store) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.transaction = transaction;
        this.store = store;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        String now = Instant.now().toString();
        jdbc.update("UPDATE procurement_run SET status='INTERRUPTED',error='服务重启，任务已中断，请重新采集',"
                + "update_time=? WHERE status='RUNNING'", now);
        try (var input = new ClassPathResource("procurement/seed.json").getInputStream()) {
            var seed = mapper.readTree(input);
            transaction.executeWithoutResult(status -> {
                int inserted = jdbc.update("INSERT OR IGNORE INTO procurement_seed(id,create_time,update_time) VALUES(?,?,?)",
                        seed.path("version").asText(), now, now);
                if (inserted == 0) { return; }
                for (var s : seed.path("sites")) {
                    jdbc.update("INSERT OR IGNORE INTO procurement_site(id,name,host,notes,create_time,update_time) VALUES(?,?,?,?,?,?)",
                            s.path("id").asText(), s.path("name").asText(), s.path("host").asText(),
                            s.path("notes").asText(), now, now);
                }
                for (var n : seed.path("notices")) {
                    jdbc.update("INSERT OR IGNORE INTO procurement_notice(id,site_id,url,title,source_data,create_time,update_time)"
                                    + " VALUES(?,?,?,?,?,?,?)", n.path("id").asText(), n.path("siteId").asText(),
                            n.path("url").asText(), n.path("title").asText(), n.path("sourceData").toString(), now, now);
                }
                for (var r : seed.path("rules")) {
                    store.saveRule(mapper.convertValue(r, Rule.class));
                }
            });
        }
    }
}
