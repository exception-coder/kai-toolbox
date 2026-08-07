package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 会话项目重命名的校验与冲突规则测试。
 */
class SessionProjectServiceTest {

    private ClaudeChatSessionRepository repository;
    private SessionProjectService service;

    @BeforeEach
    void setUp() {
        repository = mock(ClaudeChatSessionRepository.class);
        service = new SessionProjectService(repository);
    }

    /** 目标项目已存在时拒绝隐式合并。 */
    @Test
    void rejectsExistingTargetProject() {
        when(repository.groupExists("ERP")).thenReturn(true);
        when(repository.groupExists("SRM")).thenReturn(true);

        SessionProjectService.RenameResult result = service.rename("ERP", "SRM");

        assertThat(result).isEqualTo(SessionProjectService.RenameResult.TARGET_EXISTS);
        verify(repository, never()).renameGroup("ERP", "SRM");
    }

    /** 合法名称去除首尾空格后批量重命名。 */
    @Test
    void renamesProjectWithNormalizedNames() {
        when(repository.groupExists("ERP")).thenReturn(true);
        when(repository.groupExists("YOOONI ERP")).thenReturn(false);

        SessionProjectService.RenameResult result = service.rename(" ERP ", " YOOONI ERP ");

        assertThat(result).isEqualTo(SessionProjectService.RenameResult.RENAMED);
        verify(repository).renameGroup("ERP", "YOOONI ERP");
    }

    /** 未分组或空名称不能作为项目重命名来源。 */
    @Test
    void rejectsBlankProjectName() {
        assertThat(service.rename(" ", "ERP"))
                .isEqualTo(SessionProjectService.RenameResult.INVALID_NAME);
        verify(repository, never()).groupExists("ERP");
    }
}

