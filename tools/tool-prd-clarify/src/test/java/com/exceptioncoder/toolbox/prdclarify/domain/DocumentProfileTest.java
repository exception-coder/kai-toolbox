package com.exceptioncoder.toolbox.prdclarify.domain;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class DocumentProfileTest {

    @Test
    void defaultsMissingProfileToClassic() {
        assertEquals("CLASSIC", DocumentProfile.normalize(null));
        assertEquals("CLASSIC", DocumentProfile.normalize(" "));
    }

    @Test
    void normalizesSupportedProfiles() {
        assertEquals("SPEC_DRIVEN", DocumentProfile.normalize("spec_driven"));
    }

    @Test
    void rejectsUnknownProfile() {
        assertThrows(IllegalArgumentException.class, () -> DocumentProfile.normalize("AUTO_AGENT"));
    }
}
