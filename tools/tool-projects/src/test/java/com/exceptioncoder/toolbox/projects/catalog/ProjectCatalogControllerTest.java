package com.exceptioncoder.toolbox.projects.catalog;

import com.exceptioncoder.toolbox.common.project.ProjectCatalog;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProjectCatalogControllerTest {
    @Test void returnsNoContentForMutationAndRequiresExplicitVisibility() throws Exception {
        var catalog = mock(ProjectCatalog.class);
        var visibility = mock(ProjectVisibilityService.class);
        when(catalog.list(false)).thenReturn(List.of());
        var mvc = MockMvcBuilders.standaloneSetup(new ProjectCatalogController(catalog, visibility)).build();
        mvc.perform(get("/api/project-catalog")).andExpect(status().isOk()).andExpect(content().json("[]"));
        verify(catalog).list(false);
        mvc.perform(put("/api/project-catalog/visibility").contentType(MediaType.APPLICATION_JSON)
                .content("{\"path\":\"/work/erp\",\"excluded\":true}"))
                .andExpect(status().isNoContent()).andExpect(content().string(""));
        verify(visibility).setExcluded("/work/erp", true);
        mvc.perform(put("/api/project-catalog/visibility").contentType(MediaType.APPLICATION_JSON)
                .content("{\"path\":\"/work/erp\"}")).andExpect(status().isBadRequest());
        verifyNoMoreInteractions(visibility);
    }
}
