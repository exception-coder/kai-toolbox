package com.exceptioncoder.toolbox.claudechat.api;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SessionFileControllerTest {

    @Test
    void removesEditorLocationSuffixFromLinkedFilePath() {
        assertEquals("D:/workspace/App.java",
                SessionFileController.normalizeLinkedPath("D:/workspace/App.java:42:7"));
        assertEquals("D:\\workspace\\App.java",
                SessionFileController.normalizeLinkedPath("<D:\\workspace\\App.java#L42>"));
    }

    @Test
    void keepsOrdinaryPathAndRejectsBlankInput() {
        assertEquals("docs/design", SessionFileController.normalizeLinkedPath("docs/design"));
        assertThrows(IllegalArgumentException.class, () -> SessionFileController.normalizeLinkedPath("  "));
    }
}
