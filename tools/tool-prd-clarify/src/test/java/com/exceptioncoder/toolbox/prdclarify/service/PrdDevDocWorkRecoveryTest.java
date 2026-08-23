package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class PrdDevDocWorkRecoveryTest {

    @Test
    void marksProcessBoundGenerationAsRetryableAfterRestart() {
        PrdSessionRepository repository = mock(PrdSessionRepository.class);

        new PrdDevDocWorkRecovery(repository).run(new DefaultApplicationArguments());

        verify(repository).failInterruptedDevDocWork(contains("服务已重启"), anyLong());
    }
}
