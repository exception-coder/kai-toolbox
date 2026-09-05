package com.exceptioncoder.toolbox.claudechat.service.delegation;

import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionAccessGrant;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientPrincipal;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionDelegationProfile;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantException;
import com.exceptioncoder.toolbox.common.auth.config.AuthProperties;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SessionClientTokenServiceTest {

    private SessionClientTokenService service;
    private Instant now;

    @BeforeEach
    void setUp() {
        now = Instant.now();
        AuthProperties properties = new AuthProperties();
        properties.setSecret("test-session-client-secret-that-is-long-enough");
        service = new SessionClientTokenService(properties);
        service.initializeKey();
    }

    @Test
    void roundTripsAudienceRestrictedClaims() {
        SessionClientTokenService.IssuedToken issued = service.issue(grant(), now);

        SessionClientPrincipal principal = service.parse(issued.accessToken());

        assertThat(principal.subjectUserId()).isEqualTo(20);
        assertThat(principal.grantId()).isEqualTo("grant-1");
        assertThat(principal.sessionId()).isEqualTo("session-1");
        assertThat(issued.expiresAt()).isEqualTo(now.plusSeconds(1_200));
    }

    @Test
    void rejectsTokenSignedForAnotherSessionClientKey() {
        AuthProperties otherProperties = new AuthProperties();
        otherProperties.setSecret("a-different-session-client-secret-long-enough");
        SessionClientTokenService other = new SessionClientTokenService(otherProperties);
        other.initializeKey();
        String token = other.issue(grant(), now).accessToken();

        assertThatThrownBy(() -> service.parse(token)).isInstanceOf(SessionGrantException.class);
    }

    @Test
    void rejectsWrongAudienceEvenWithTheSessionClientSigningKey() throws Exception {
        byte[] derived = MessageDigest.getInstance("SHA-256").digest(
                "test-session-client-secret-that-is-long-enough:session-client-token:v1"
                        .getBytes(StandardCharsets.UTF_8));
        String token = Jwts.builder()
                .subject("20")
                .id("token-1")
                .claim("aud", "ordinary-forge-api")
                .claim("kind", "session_client_access")
                .claim("grant_id", "grant-1")
                .claim("session_id", "session-1")
                .expiration(Date.from(Instant.now().plusSeconds(300)))
                .signWith(Keys.hmacShaKeyFor(derived))
                .compact();

        assertThatThrownBy(() -> service.parse(token))
                .isInstanceOfSatisfying(SessionGrantException.class,
                        error -> assertThat(error.code().name()).isEqualTo("AUTHENTICATION_REQUIRED"));
    }

    @Test
    void credentialHashIsStableWithoutPersistingRawValue() {
        AuthProperties properties = new AuthProperties();
        properties.setSecret("test-session-client-secret-that-is-long-enough");
        SessionCredentialService credentials = new SessionCredentialService(properties);
        String raw = credentials.issueRawCredential();

        assertThat(credentials.hash(raw)).isEqualTo(credentials.hash(raw)).doesNotContain(raw);
    }

    private SessionAccessGrant grant() {
        return SessionAccessGrant.create("grant-1", "session-1", 20, 10,
                SessionDelegationProfile.DELEGATED_DEVELOPMENT, now.plusSeconds(1_200),
                20, 4_096, now);
    }
}
