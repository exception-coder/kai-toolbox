package com.exceptioncoder.forge.quality.plugin.java;

import com.exceptioncoder.forge.quality.core.ChangeSet;
import com.exceptioncoder.forge.quality.core.Finding;
import com.exceptioncoder.forge.quality.core.Severity;
import com.exceptioncoder.forge.quality.core.StackCapability;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JavaQualityPluginTest {
    @TempDir
    Path project;

    @Test
    void detectsMultiplePersistenceAdapters() throws IOException {
        Path pom = write("pom.xml", """
                <project><dependencies>
                  <dependency><artifactId>mybatis-spring-boot-starter</artifactId></dependency>
                  <dependency><artifactId>spring-boot-starter-data-jpa</artifactId></dependency>
                </dependencies></project>
                """);

        List<StackCapability> capabilities = new JavaStackDetector()
                .detect(new com.exceptioncoder.forge.quality.core.DetectionContext(project, List.of(pom)));

        assertTrue(capabilities.stream().anyMatch(item -> item.id().equals("persistence.mybatis")));
        assertTrue(capabilities.stream().anyMatch(item -> item.id().equals("persistence.jpa")));
    }

    @Test
    void reportsUnboundParameterForMultiParameterMethod() throws IOException {
        Path mapper = write("src/main/java/example/QuoteMapper.java", """
                package example;
                import org.apache.ibatis.annotations.Param;
                interface QuoteMapper {
                    Object find(@Param("supplierId") Long supplierId, @Param("status") String status);
                }
                """);
        Path xml = write("src/main/resources/QuoteMapper.xml", """
                <mapper namespace="example.QuoteMapper">
                  <select id="find">SELECT id FROM quote WHERE supplier_id = #{missing}</select>
                </mapper>
                """);

        List<Finding> findings = checker().check(new ChangeSet(project, List.of(mapper, xml)), capabilities());

        assertEquals(1, findings.size());
        assertEquals(Severity.ERROR, findings.getFirst().severity());
        assertTrue(findings.getFirst().message().contains("missing"));
    }

    @Test
    void acceptsAnnotatedParameterBinding() throws IOException {
        Path mapper = write("src/main/java/example/QuoteMapper.java", """
                package example;
                import org.apache.ibatis.annotations.Param;
                interface QuoteMapper { Object find(@Param("supplierId") Long supplierId); }
                """);
        Path xml = write("src/main/resources/QuoteMapper.xml", """
                <mapper namespace="example.QuoteMapper">
                  <select id="find">SELECT id FROM quote WHERE supplier_id = #{supplierId}</select>
                </mapper>
                """);

        List<Finding> findings = checker().check(new ChangeSet(project, List.of(mapper, xml)), capabilities());

        assertTrue(findings.isEmpty());
    }

    @Test
    void acceptsStandardMyBatisMapperDtdWithoutNetworkAccess() throws IOException {
        Path mapper = write("src/main/java/example/QuoteMapper.java", """
                package example;
                import org.apache.ibatis.annotations.Param;
                interface QuoteMapper { Object find(@Param("supplierId") Long supplierId); }
                """);

        for (String scheme : List.of("https", "http")) {
            Path xml = write("src/main/resources/QuoteMapper-" + scheme + ".xml", """
                    <?xml version="1.0" encoding="UTF-8"?>
                    <!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
                            "%s://mybatis.org/dtd/mybatis-3-mapper.dtd">
                    <mapper namespace="example.QuoteMapper">
                      <select id="find">SELECT id FROM quote WHERE supplier_id = #{supplierId}</select>
                    </mapper>
                    """.formatted(scheme));

            List<Finding> findings = checker().check(new ChangeSet(project, List.of(mapper, xml)), capabilities());

            assertTrue(findings.isEmpty(), () -> scheme + " DTD findings: " + findings);
        }
    }

    @Test
    void rejectsUnknownExternalDtd() throws IOException {
        Path mapper = write("src/main/java/example/QuoteMapper.java", """
                package example;
                interface QuoteMapper { Object find(Long id); }
                """);
        Path xml = write("src/main/resources/QuoteMapper.xml", """
                <?xml version="1.0" encoding="UTF-8"?>
                <!DOCTYPE mapper SYSTEM "https://example.invalid/untrusted.dtd">
                <mapper namespace="example.QuoteMapper">
                  <select id="find">SELECT id FROM quote WHERE id = #{id}</select>
                </mapper>
                """);

        List<Finding> findings = checker().check(new ChangeSet(project, List.of(mapper, xml)), capabilities());

        assertEquals(1, findings.size());
        assertEquals(Severity.ERROR, findings.getFirst().severity());
        assertTrue(findings.getFirst().message().contains("could not be validated"));
    }

    private MyBatisParameterBindingChecker checker() {
        return new MyBatisParameterBindingChecker();
    }

    private List<StackCapability> capabilities() {
        return List.of(new StackCapability("persistence.mybatis", "MyBatis", List.of("pom.xml")));
    }

    private Path write(String relativePath, String content) throws IOException {
        Path file = project.resolve(relativePath);
        Files.createDirectories(file.getParent());
        Files.writeString(file, content);
        return file;
    }
}
