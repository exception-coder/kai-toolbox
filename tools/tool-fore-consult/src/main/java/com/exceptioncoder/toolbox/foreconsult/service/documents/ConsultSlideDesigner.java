package com.exceptioncoder.toolbox.foreconsult.service.documents;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultDocumentRequest;
import org.apache.poi.sl.usermodel.ShapeType;
import org.apache.poi.sl.usermodel.TextParagraph.TextAlign;
import org.apache.poi.xslf.usermodel.*;
import java.awt.Color;
import java.awt.geom.Rectangle2D;

/** 把模型编排的图形指令写成可编辑PowerPoint对象，不使用固定幻灯片模板。 */
public final class ConsultSlideDesigner {
    private ConsultSlideDesigner() { }

    public static void render(XMLSlideShow deck, ConsultDocumentRequest request) {
        var theme = request.layout().theme();
        String font = theme == null || theme.font() == null ? "Microsoft YaHei" : theme.font();
        for (var page : request.layout().pages()) {
            var slide = deck.createSlide();
            slide.getBackground().setFillColor(color(page.background(), theme == null ? null : theme.background(), "FFFFFF"));
            for (var element : page.elements()) {
                XSLFAutoShape shape = slide.createAutoShape();
                shape.setShapeType(switch (element.kind()) {
                    case "ellipse" -> ShapeType.ELLIPSE;
                    case "line" -> ShapeType.LINE;
                    default -> ShapeType.RECT;
                });
                shape.setAnchor(new Rectangle2D.Double(element.x(), element.y(), element.w(), element.h()));
                shape.setFillColor(element.fill() == null ? null : Color.decode("#" + element.fill()));
                shape.setLineColor("line".equals(element.kind()) ? color(element.color(), null, "CBD5E1") : null);
                if (element.text() != null) {
                    shape.setText(element.text()); shape.setLeftInset(4); shape.setRightInset(4);
                    shape.setTopInset(2); shape.setBottomInset(2);
                    for (var paragraph : shape.getTextParagraphs()) {
                        paragraph.setTextAlign(switch (element.align() == null ? "left" : element.align()) {
                            case "center" -> TextAlign.CENTER;
                            case "right" -> TextAlign.RIGHT;
                            default -> TextAlign.LEFT;
                        });
                        for (var run : paragraph.getTextRuns()) {
                            run.setFontFamily(font);
                            run.setFontSize(element.fontSize() == null ? 18 : element.fontSize());
                            run.setBold(Boolean.TRUE.equals(element.bold()));
                            run.setFontColor(color(element.color(), theme == null ? null : theme.foreground(), "1C2737"));
                        }
                    }
                }
            }
        }
    }

    public static Color color(String value, String fallback, String defaultValue) {
        return Color.decode("#" + (value != null ? value : fallback != null ? fallback : defaultValue));
    }
}
