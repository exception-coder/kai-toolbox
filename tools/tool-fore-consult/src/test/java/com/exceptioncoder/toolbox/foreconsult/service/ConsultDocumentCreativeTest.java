package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConsultDocumentCreativeTest {
    @TempDir Path root;
    final ObjectMapper mapper = new ObjectMapper();
    ConsultDocumentService service;
    final String deck = """
            {"format":"pptx","title":"采购经营回顾","layout":{"theme":{"font":"Microsoft YaHei"},"pages":[
              {"background":"142D3D","elements":[
                {"kind":"text","x":56,"y":42,"w":820,"h":70,"text":"采购经营回顾","fontSize":36,"color":"FFFFFF","bold":true},
                {"kind":"text","x":60,"y":132,"w":820,"h":45,"text":"本周完成 19 项业务口径确认","fontSize":22,"color":"BCD6DD"},
                {"kind":"rect","x":60,"y":226,"w":240,"h":216,"fill":"34756F"},
                {"kind":"text","x":80,"y":250,"w":200,"h":100,"text":"19","fontSize":52,"color":"FFFFFF","bold":true},
                {"kind":"text","x":80,"y":368,"w":190,"h":40,"text":"确认的业务定义","fontSize":16,"color":"FFFFFF"},
                {"kind":"rect","x":352,"y":300,"w":90,"h":142,"fill":"75B2A2"},
                {"kind":"rect","x":488,"y":254,"w":90,"h":188,"fill":"75B2A2"},
                {"kind":"rect","x":624,"y":200,"w":90,"h":242,"fill":"BCD6DD"},
                {"kind":"text","x":352,"y":456,"w":400,"h":35,"text":"周一          周二          周三","fontSize":15,"color":"BCD6DD"}
              ]}]}}
            """;
    final String sheet = """
            {"format":"xlsx","title":"采购统计","sheets":[{"name":"采购","columns":["类别","金额","数量","单价"],
             "rows":[["纱线",1200,10,null],["面料",800,5,null]]}],
             "layout":{"theme":{"accent":"225A54"},"sheets":[{"sheet":0,"widths":[24,18,12,18],
             "formats":["text","money","number","money"],"formulas":[{"row":1,"column":3,"expression":"B2/C2"},
             {"row":2,"column":3,"expression":"ROUND(B3/C3,2)"}],
             "chart":{"type":"bar","title":"采购单价","categoryColumn":0,"valueColumns":[3]}}]}}
            """;

    @BeforeEach void setup() {
        var sessions = mock(ConsultSessionRepository.class);
        when(sessions.findByDevSessionId("runtime-a")).thenReturn(Optional.of(ConsultSession.builder().sessionId("consult-a").build()));
        service = new ConsultDocumentService(root.resolve("artifacts"), mapper, sessions, new ConsultDocumentRenderer());
    }

    @Test void nativeEditableSlideDesignAndActualPngPreview() throws Exception {
        var file = service.create("runtime-a", mapper.readTree(deck));
        byte[] bytes = service.download("consult-a", file.id()).content();
        try (var presentation = new XMLSlideShow(new ByteArrayInputStream(bytes))) {
            assertThat(presentation.getSlides().getFirst().getShapes()).hasSize(9);
            assertThat(presentation.getSlides().getFirst().getShapes().get(2).getAnchor().getWidth()).isEqualTo(240);
        }
        var preview = service.previewForRuntime("runtime-a", file.id(), 1);
        assertThat(preview.kind()).isEqualTo("slides");
        assertThat(preview.notes()).noneMatch(note -> note.contains("超出"));
        var image = javax.imageio.ImageIO.read(new ByteArrayInputStream(Base64.getDecoder().decode(preview.imageBase64())));
        assertThat(image.getWidth()).isEqualTo(960); assertThat(image.getHeight()).isEqualTo(540);
        assertThat(new java.awt.Color(image.getRGB(10, 10))).isEqualTo(new java.awt.Color(20, 45, 61));
        evidence("采购经营回顾.pptx", bytes);
        evidence("采购经营回顾.png", Base64.getDecoder().decode(preview.imageBase64()));
        assertThat(service.create("runtime-a", mapper.readTree(deck))).isEqualTo(file);
        var revised = service.create("runtime-a", mapper.readTree(deck.replace("19 项", "20 项")));
        assertThat(revised.id()).isNotEqualTo(file.id()); assertThat(service.list("consult-a")).hasSize(2);
    }

    @Test void excelHasComputedFormulaStylesAndNativeChart() throws Exception {
        var file = service.create("runtime-a", mapper.readTree(sheet));
        var bytes = service.download("consult-a", file.id()).content();
        try (var workbook = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            var tab = workbook.getSheetAt(0);
            assertThat(tab.getRow(1).getCell(3).getNumericCellValue()).isEqualTo(120);
            assertThat(tab.getRow(2).getCell(3).getNumericCellValue()).isEqualTo(160);
            assertThat(tab.getColumnWidth(0)).isEqualTo(24 * 256);
            assertThat(tab.getDrawingPatriarch().getCharts()).hasSize(1);
            var cached = tab.getDrawingPatriarch().getCharts().getFirst().getCTChart()
                    .getPlotArea().getBarChartArray(0).getSerArray(0).getVal().getNumRef().getNumCache();
            assertThat(cached.getPtArray(0).getV()).isEqualTo("120.0");
            assertThat(cached.getPtArray(1).getV()).isEqualTo("160.0");
            assertThat(tab.getRow(1).getCell(1).getCellStyle().getDataFormatString()).isEqualTo("#,##0.00");
        }
        var preview = service.preview("consult-a", file.id(), 1);
        assertThat(preview.kind()).isEqualTo("structure"); assertThat(preview.notes().getFirst()).contains("图表");
        evidence("采购统计.xlsx", bytes);
        evidence("采购统计.png", Base64.getDecoder().decode(preview.imageBase64()));
    }

    @Test void wordUsesModelHierarchyAndLandscapeWithHonestPreview() throws Exception {
        var file = service.create("runtime-a", mapper.readTree("""
          {"format":"docx","title":"采购业务说明","sections":[{"heading":"一、结论","paragraphs":["已核对19项业务定义，请业务负责人复核。"]}],
           "layout":{"theme":{"accent":"225A54"},"word":{"titleSize":28,"headingSize":18,"bodySize":12,"landscape":true}}}
          """));
        var bytes = service.download("consult-a", file.id()).content();
        try (var document = new XWPFDocument(new ByteArrayInputStream(bytes))) {
            assertThat(document.getParagraphs().getFirst().getRuns().getFirst().getColor()).isEqualTo("225A54");
            assertThat(document.getParagraphs().getFirst().getRuns().getFirst().getFontSizeAsDouble()).isEqualTo(28.0);
            assertThat(document.getDocument().getBody().getSectPr().getPgSz().getOrient().toString()).isEqualTo("landscape");
        }
        assertThat(service.preview("consult-a", file.id(), 1).notes().getFirst()).contains("不代表Word最终分页");
        evidence("采购业务说明.docx", bytes);
    }

    @Test void rejectsExternalFormulasOutOfCanvasNullKindsAndWrongLayoutBeforePublishing() throws Exception {
        for (String invalid : new String[]{deck.replace("\"x\":56", "\"x\":900"), deck.replace("\"kind\":\"text\"", "\"kind\":null"),
                sheet.replace("B2/C2", "WEBSERVICE(1)"), sheet.replace("B2/C2", "[book]sheet!A1"),
                sheet.replace("B2/C2", "A999999"), sheet.replace("B2/C2", "B2/0"), sheet.replace("B2/C2", "B2>0"),
                deck.replace("\"fill\":\"34756F\"", "\"fill\":\"url(secret)\""),
                deck.replace("\"background\":\"142D3D\"", "\"path\":\"secret\"")}) {
            assertThatThrownBy(() -> service.create("runtime-a", mapper.readTree(invalid))).isInstanceOf(IllegalArgumentException.class);
        }
        assertThat(service.list("consult-a")).isEmpty();
    }

    @Test void previewsRespectScopeAndPageBounds() throws Exception {
        var file = service.create("runtime-a", mapper.readTree(deck));
        assertThatThrownBy(() -> service.preview("other-consult", file.id(), 1)).hasMessageContaining("不存在");
        assertThatThrownBy(() -> service.previewForRuntime("other-runtime", file.id(), 1)).hasMessageContaining("未关联");
        assertThatThrownBy(() -> service.preview("consult-a", file.id(), 2)).hasMessageContaining("超过文件页数");
    }

    @Test void actualRenderingReportsTextOverflowForModelRevision() throws Exception {
        var file = service.create("runtime-a", mapper.readTree(deck.replace("\"h\":100", "\"h\":70")));
        assertThat(service.preview("consult-a", file.id(), 1).notes()).anyMatch(note -> note.contains("19") && note.contains("超出"));
    }

    private void evidence(String name, byte[] bytes) throws Exception {
        String directory = System.getProperty("consult.document.evidence");
        if (directory != null) { Files.write(Files.createDirectories(Path.of(directory)).resolve(name), bytes); }
    }
}
