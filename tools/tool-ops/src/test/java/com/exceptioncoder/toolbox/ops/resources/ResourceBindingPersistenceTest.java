package com.exceptioncoder.toolbox.ops.resources;

import com.exceptioncoder.toolbox.ops.resources.domain.ResourceBinding;
import com.exceptioncoder.toolbox.ops.resources.infrastructure.JdbcResourceBindingStore;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import static org.junit.jupiter.api.Assertions.*;

class ResourceBindingPersistenceTest {
    @TempDir Path directory;

    @Test void repeatedSchemaAndBindingPreserveIdentityAndUnbindOnlyReference() throws Exception {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:sqlite:" + directory.resolve("bindings.db")));
        String schema = new ClassPathResource("db/ops-resource-schema.sql").getContentAsString(StandardCharsets.UTF_8);
        jdbc.execute(schema);
        jdbc.execute(schema);
        var store = new JdbcResourceBindingStore(jdbc);
        store.save(new ResourceBinding("first", "system", "provider", "source", "用途", true));
        store.save(new ResourceBinding("second", "system", "provider", "source", "更新用途", false));
        assertEquals(1, store.list().size());
        assertEquals("first", store.list().getFirst().id());
        assertEquals("更新用途", store.list().getFirst().purpose());
        assertFalse(store.list().getFirst().enabled());
        store.delete("first");
        assertTrue(store.list().isEmpty());
    }
}
