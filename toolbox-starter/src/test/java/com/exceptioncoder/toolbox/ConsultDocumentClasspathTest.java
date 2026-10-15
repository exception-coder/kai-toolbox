package com.exceptioncoder.toolbox;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultDocumentRequest;
import com.exceptioncoder.toolbox.foreconsult.service.ConsultDocumentRenderer;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import java.io.ByteArrayInputStream;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

/** 用宿主完整类路径验证三种 Office 生成器，防止模块单测掩盖依赖版本冲突。 */
class ConsultDocumentClasspathTest {
    @Test void officeGenerationWorksWithTheFullHostClasspath() throws Exception {
        var renderer = new ConsultDocumentRenderer();
        var word = new ConsultDocumentRequest("docx", "确认说明",
                List.of(new ConsultDocumentRequest.Section("口径", List.of("库存按实存计算"), null)), null, null);
        try (var document = new XWPFDocument(new ByteArrayInputStream(renderer.render(word)))) {
            assertThat(document.getParagraphs().getFirst().getText()).isEqualTo("确认说明");
        }
        var excel = new ConsultDocumentRequest("xlsx", "确认表", null,
                List.of(new ConsultDocumentRequest.Sheet("指标", List.of("名称"), List.of(List.of("库存")))), null);
        try (var workbook = new XSSFWorkbook(new ByteArrayInputStream(renderer.render(excel)))) {
            assertThat(workbook.getSheetAt(0).getRow(1).getCell(0).getStringCellValue()).isEqualTo("库存");
        }
        var slides = new ConsultDocumentRequest("pptx", "确认汇报", null, null,
                List.of(new ConsultDocumentRequest.Slide("进展", List.of("完成业务口径核对"))));
        try (var deck = new XMLSlideShow(new ByteArrayInputStream(renderer.render(slides)))) {
            assertThat(deck.getSlides()).hasSize(1);
        }
    }
}
