package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConsultDocumentServiceTest {
    @TempDir Path temporary;
    final ObjectMapper mapper = new ObjectMapper();
    final ConsultSessionRepository sessions = mock(ConsultSessionRepository.class);
    ConsultDocumentService documents;
    final String excel = """
            {"format":"xlsx","title":"业务定义确认表","sheets":[{"name":"业务口径",
              "columns":["定义","数值","确认"],"rows":[["=1+1",19,true],
                ["001234567890123456789",null,false]]}]}
            """;

    @BeforeEach void prepare() {
        when(sessions.findByDevSessionId("runtime-a")).thenReturn(Optional.of(ConsultSession.builder()
                .sessionId("consult-a").userId("7").build()));
        documents = new ConsultDocumentService(temporary.resolve("artifacts"), mapper, sessions,
                new ConsultDocumentRenderer());
    }

    @Test void excelIsRealOfficeFileAndStringsCannotBecomeFormulas() throws Exception {
        var file = documents.create("runtime-a", mapper.readTree(excel));
        var content = documents.download("consult-a", file.id()).content();
        try (var workbook = new XSSFWorkbook(new ByteArrayInputStream(content))) {
            var sheet = workbook.getSheetAt(0);
            assertThat(sheet.getSheetName()).isEqualTo("业务口径");
            assertThat(sheet.getRow(1).getCell(0).getCellType()).isEqualTo(CellType.STRING);
            assertThat(sheet.getRow(1).getCell(1).getNumericCellValue()).isEqualTo(19);
            assertThat(sheet.getRow(1).getCell(2).getBooleanCellValue()).isTrue();
            assertThat(sheet.getRow(2).getCell(0).getStringCellValue()).isEqualTo("001234567890123456789");
            assertThat(sheet.getPaneInformation().isFreezePane()).isTrue();
        }
        assertThat(file.downloadUrl()).startsWith("/api/fore-consult/sessions/consult-a/documents/");
        assertThat(file.storagePath()).startsWith(".kai-toolbox/consult-artifacts/consult-a/");
    }

    @Test void wordContainsChineseParagraphsAndTable() throws Exception {
        var file = documents.create("runtime-a", mapper.readTree("""
                {"format":"docx","title":"采购说明","sections":[{"heading":"确认口径",
                  "paragraphs":["这里是已经确认的业务定义。"],"table":[["指标","含义"],["库存","实存"]]}]}
                """));
        try (var word = new XWPFDocument(new ByteArrayInputStream(documents.download("consult-a", file.id()).content()))) {
            assertThat(word.getParagraphs()).anySatisfy(p -> assertThat(p.getText()).contains("采购说明"));
            assertThat(word.getTables().getFirst().getRow(1).getCell(1).getText()).isEqualTo("实存");
        }
    }

    @Test void powerpointContainsEditableSlidesWithBoundedCanvas() throws Exception {
        var file = documents.create("runtime-a", mapper.readTree("""
                {"format":"pptx","title":"采购汇报","slides":[{"title":"本周进展","bullets":["确认19项口径","下一步：业务复核"]},
                  {"title":"待确认","bullets":["周转率计算方式"]}]}
                """));
        try (var deck = new XMLSlideShow(new ByteArrayInputStream(documents.download("consult-a", file.id()).content()))) {
            assertThat(deck.getSlides()).hasSize(2);
            assertThat(deck.getPageSize().getWidth()).isEqualTo(960);
            assertThat(deck.getSlides().getFirst().getShapes().stream()
                    .filter(shape -> shape instanceof org.apache.poi.xslf.usermodel.XSLFTextShape)
                    .map(shape -> ((org.apache.poi.xslf.usermodel.XSLFTextShape) shape).getText()))
                    .anySatisfy(text -> assertThat(text).contains("确认19项口径"));
        }
    }

    @Test void retriesAndNewServiceInstanceReusePersistedArtifact() throws Exception {
        var first = documents.create("runtime-a", mapper.readTree(excel));
        var restored = new ConsultDocumentService(temporary.resolve("artifacts"), mapper, sessions,
                new ConsultDocumentRenderer());
        assertThat(restored.create("runtime-a", mapper.readTree(excel))).isEqualTo(first);
        assertThat(restored.list("consult-a")).containsExactly(first);
        assertThat(restored.list("consult-b")).isEmpty();
        assertThatThrownBy(() -> restored.download("consult-b", first.id())).hasMessageContaining("文档不存在");
    }

    @Test void rejectsUnlinkedAndEndedRuntime() throws Exception {
        assertThatThrownBy(() -> documents.create("other", mapper.readTree(excel))).hasMessageContaining("未关联");
        when(sessions.findByDevSessionId("runtime-a")).thenReturn(Optional.of(ConsultSession.builder()
                .sessionId("consult-a").endedAt(1L).build()));
        assertThatThrownBy(() -> documents.create("runtime-a", mapper.readTree(excel))).hasMessageContaining("咨询已结束");
    }

    @Test void rejectsPathsScriptsMacrosAndInvalidShapesBeforeWriting() {
        for (String request : new String[] {
                excel.replace("\"title\":", "\"path\":\"../../escape\",\"title\":"),
                excel.replace("\"xlsx\"", "\"xlsm\""),
                excel.replace("19,true", "19"),
                excel.replace("19,true", "{\"formula\":\"1+1\"},true"),
                excel.replace("19,true", "1234567890123456789,true"),
                excel.replace("业务口径", "../非法"),
                "{\"format\":\"pptx\",\"title\":\"汇报\",\"slides\":[{\"title\":\"进展\",\"bullets\":[\"" + "长".repeat(66) + "\"]}]}",
                "{\"format\":\"docx\",\"title\":\"说明\",\"sections\":[null]}" }) {
            assertThatThrownBy(() -> documents.create("runtime-a", mapper.readTree(request)))
                    .isInstanceOf(IllegalArgumentException.class);
        }
        assertThat(temporary.resolve("artifacts")).doesNotExist();
        assertThatThrownBy(() -> documents.list("../escape")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> documents.download("consult-a", "../../file")).hasMessageContaining("文档不存在");
    }

    @Test void refusesOversizedContentAndQuotaWithoutCreatingArtifact() throws Exception {
        assertThatThrownBy(() -> documents.create("runtime-a", mapper.readTree(excel.replace("业务定义确认表", "大".repeat(300_001)))))
                .isInstanceOf(IllegalArgumentException.class);
        var word = mapper.createObjectNode().put("format", "docx").put("title", "大量段落");
        var sections = word.putArray("sections");
        for (int section = 0; section < 6; section++) {
            var paragraphs = sections.addObject().putArray("paragraphs");
            for (int paragraph = 0; paragraph < 200; paragraph++) {
                paragraphs.add("短段落");
            }
        }
        assertThatThrownBy(() -> documents.create("runtime-a", word)).hasMessageContaining("Word 总段落");
        var directory = Files.createDirectories(temporary.resolve("artifacts/consult-a"));
        for (int index = 0; index < 200; index++) {
            Files.writeString(directory.resolve("quota-" + index), "reserved");
        }
        assertThatThrownBy(() -> documents.create("runtime-a", mapper.readTree(excel))).hasMessageContaining("额度不足");
        assertThat(documents.list("consult-a")).isEmpty();
    }

    @Test void sanitizesDisplayNameButNeverUsesItForDiskLocation() throws Exception {
        var file = documents.create("runtime-a", mapper.readTree(excel.replace("业务定义确认表", "../../业务表")));
        assertThat(file.name()).doesNotContain("/", "\\");
        assertThat(temporary.resolve("artifacts/consult-a/" + file.id() + ".xlsx")).exists();
    }

    @Test void refusesLinksToFilesOutsideControlledRoot() throws Exception {
        var file = documents.create("runtime-a", mapper.readTree(excel));
        Path stored = temporary.resolve("artifacts/consult-a/" + file.id() + ".xlsx");
        Path outside = temporary.resolve("outside.xlsx");
        Files.move(stored, outside);
        try {
            Files.createSymbolicLink(stored, outside);
        } catch (java.nio.file.FileSystemException exception) {
            // Windows 普通用户没有符号链接权限时，改测无需提权的目录 junction。
            if (!System.getProperty("os.name").startsWith("Windows")) {
                throw exception;
            }
            Path directory = stored.getParent();
            Path externalDirectory = temporary.resolve("external-directory");
            Files.move(directory, externalDirectory);
            Files.move(outside, externalDirectory.resolve(stored.getFileName()));
            var process = new ProcessBuilder("cmd.exe", "/c", "mklink", "/J",
                    directory.toString(), externalDirectory.toString()).redirectErrorStream(true).start();
            String output = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            assertThat(process.waitFor()).withFailMessage(output).isZero();
        }
        assertThatThrownBy(() -> documents.download("consult-a", file.id())).hasMessageContaining("链接");
    }
}
