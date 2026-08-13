package com.exceptioncoder.toolbox.claudechat.service;

public interface ReviewThreadForkGateway {
    String forkForReview(String sourceThreadId, String lastTurnId, String codexHome, String reviewCwd);
}
