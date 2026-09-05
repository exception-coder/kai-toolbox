package com.exceptioncoder.toolbox.claudechat.service.delegation;

import com.exceptioncoder.toolbox.claudechat.api.dto.SessionClientCommand;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionClientEvent;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionAccessGrant;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientErrorCode;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionDelegationProfile;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantException;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionCommandReceipt;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionParticipantCommand;
import com.exceptioncoder.toolbox.claudechat.repository.SessionDelegationRepository;
import com.exceptioncoder.toolbox.claudechat.service.AttachmentStorageService;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionClientCommandServiceTest {

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    @Test
    void returnsPersistedReceiptForDuplicateCommandWithoutRunningItAgain() throws Exception {
        Fixture fixture = fixture();
        SessionClientEvent previous = SessionClientEvent.data("1.0", "commandAccepted", 0, 3,
                new SessionClientEvent.CommandAccepted("same-command", "acknowledge", 0));
        Instant now = Instant.parse("2026-09-05T12:00:00Z");
        SessionCommandReceipt receipt = new SessionCommandReceipt("receipt-1", "grant-1", "same-command",
                SessionParticipantCommand.ACKNOWLEDGE, 3, mapper.writeValueAsString(previous), now, now);
        when(fixture.repository().findCommandReceipt("grant-1", "same-command"))
                .thenReturn(Optional.of(receipt));

        SessionClientEvent result = fixture.service().acknowledge(binding(3),
                new SessionClientCommand.Acknowledge("same-command", 3, 9), now);

        assertThat(result.protocolVersion()).isEqualTo(previous.protocolVersion());
        assertThat(result.type()).isEqualTo("commandAccepted");
        assertThat(result.sessionVersion()).isEqualTo(3);
        JsonNode resultData = mapper.valueToTree(result.data());
        JsonNode previousData = mapper.valueToTree(previous.data());
        assertThat(resultData).isEqualTo(previousData);
        verify(fixture.repository(), never()).insertCommandReceipt(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void rejectsStaleExpectedVersionBeforeExecutingCommand() {
        Fixture fixture = fixture();
        Instant now = Instant.parse("2026-09-05T12:00:00Z");
        SessionAccessGrant grant = SessionAccessGrant.create("grant-1", "session-1", 12, 1,
                SessionDelegationProfile.DELEGATED_DEVELOPMENT, now.plusSeconds(3600), 10, 4096, now);
        when(fixture.repository().findCommandReceipt("grant-1", "new-command")).thenReturn(Optional.empty());
        when(fixture.repository().findGrant("grant-1")).thenReturn(Optional.of(grant));

        assertThatThrownBy(() -> fixture.service().acknowledge(binding(0),
                new SessionClientCommand.Acknowledge("new-command", 1, 9), now.plusSeconds(1)))
                .isInstanceOfSatisfying(SessionGrantException.class,
                        error -> assertThat(error.code()).isEqualTo(SessionClientErrorCode.SESSION_VERSION_CONFLICT));
        verify(fixture.repository(), never()).insertCommandReceipt(org.mockito.ArgumentMatchers.any());
    }

    private Fixture fixture() {
        SessionDelegationRepository repository = mock(SessionDelegationRepository.class);
        return new Fixture(repository, new SessionClientCommandService(repository,
                mock(AttachmentStorageService.class), mock(ClaudeChatService.class),
                mock(SessionClientConnectionRegistry.class), mapper));
    }

    private SessionDelegationService.ConnectionBinding binding(long version) {
        return new SessionDelegationService.ConnectionBinding("grant-1", "session-1", 12,
                SessionDelegationProfile.DELEGATED_DEVELOPMENT, version);
    }

    private record Fixture(SessionDelegationRepository repository, SessionClientCommandService service) {
    }
}
