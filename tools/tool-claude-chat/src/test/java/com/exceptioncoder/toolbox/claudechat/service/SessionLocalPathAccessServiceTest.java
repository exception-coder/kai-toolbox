package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceDirView;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SessionLocalPathAccessServiceTest {

    private static final String SESSION_ID = "session-1";

    @Test
    void allowsAbsolutePathFromRegisteredWorkspaceProject(@TempDir Path tempDirectory) {
        Path primary = tempDirectory.resolve("erp").toAbsolutePath().normalize();
        Path registered = tempDirectory.resolve("srm").toAbsolutePath().normalize();
        SessionLocalPathAccessService service = service(primary, registered, List.of());

        Path target = registered.resolve("sql/migration.sql");

        assertEquals(target, service.resolve(SESSION_ID, primary, target.toString()));
    }

    @Test
    void allowsAbsolutePathFromSessionAdditionalProject(@TempDir Path tempDirectory) {
        Path primary = tempDirectory.resolve("erp").toAbsolutePath().normalize();
        Path additional = tempDirectory.resolve("scm").toAbsolutePath().normalize();
        SessionLocalPathAccessService service = service(primary, null, List.of(additional.toString()));

        Path target = additional.resolve("README.md");

        assertEquals(target, service.resolve(SESSION_ID, primary, target.toString()));
    }

    @Test
    void rejectsAbsolutePathOutsideRegisteredProjects(@TempDir Path tempDirectory) {
        Path primary = tempDirectory.resolve("erp").toAbsolutePath().normalize();
        Path registered = tempDirectory.resolve("srm").toAbsolutePath().normalize();
        SessionLocalPathAccessService service = service(primary, registered, List.of());

        Path outside = tempDirectory.resolve("private/secret.txt").toAbsolutePath().normalize();

        assertThrows(IllegalArgumentException.class,
                () -> service.resolve(SESSION_ID, primary, outside.toString()));
    }

    @Test
    void rejectsRelativeTraversalEvenWhenAnotherProjectIsRegistered(@TempDir Path tempDirectory) {
        Path primary = tempDirectory.resolve("erp").toAbsolutePath().normalize();
        Path registered = tempDirectory.resolve("srm").toAbsolutePath().normalize();
        SessionLocalPathAccessService service = service(primary, registered, List.of());

        assertThrows(IllegalArgumentException.class,
                () -> service.resolve(SESSION_ID, primary, "../srm/sql/migration.sql"));
    }

    private static SessionLocalPathAccessService service(Path primary, Path registered,
                                                         List<String> additionalProjects) {
        SessionProjectDirectoryService projectDirectoryService = mock(SessionProjectDirectoryService.class);
        WorkspaceScanService workspaceScanService = mock(WorkspaceScanService.class);
        when(projectDirectoryService.list(SESSION_ID)).thenReturn(additionalProjects);
        List<WorkspaceDirView> directories = registered == null ? List.of() : List.of(
                new WorkspaceDirView(registered.getFileName().toString(), registered.toString(), null,
                        registered.getFileName().toString()));
        when(workspaceScanService.scan()).thenReturn(new WorkspaceListResponse(List.of(
                new WorkspaceListResponse.RootView(primary.getParent().toString(), true, directories)),
                OffsetDateTime.now()));
        return new SessionLocalPathAccessService(projectDirectoryService, workspaceScanService);
    }
}
