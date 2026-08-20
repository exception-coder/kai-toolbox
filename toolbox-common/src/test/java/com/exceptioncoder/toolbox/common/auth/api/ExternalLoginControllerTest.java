package com.exceptioncoder.toolbox.common.auth.api;

import com.exceptioncoder.toolbox.common.auth.domain.AuthUser;
import com.exceptioncoder.toolbox.common.auth.service.AccessTokenGrant;
import com.exceptioncoder.toolbox.common.auth.service.AuthUserService;
import com.exceptioncoder.toolbox.common.auth.service.TokenService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ExternalLoginControllerTest {

    @Test
    void returnsOnlyShortLivedAccessToken() throws Exception {
        AuthUserService userService = mock(AuthUserService.class);
        TokenService tokenService = mock(TokenService.class);
        AuthUser user = AuthUser.builder()
                .id(7L)
                .username("external-user")
                .roles(List.of("USER"))
                .enabled(true)
                .build();
        when(userService.authenticate("external-user", "secret")).thenReturn(user);
        when(tokenService.issueAccessFor(user)).thenReturn(new AccessTokenGrant("access-token", 1800));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(
                new ExternalLoginController(userService, tokenService)).build();

        mvc.perform(post("/api/auth/external-login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"external-user","password":"secret"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("access-token"))
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.expiresIn").value(1800))
                .andExpect(jsonPath("$.refreshToken").doesNotExist());

        verify(userService).authenticate("external-user", "secret");
        verify(tokenService).issueAccessFor(user);
    }
}
