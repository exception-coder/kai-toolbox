CREATE TABLE IF NOT EXISTS assistant_feedback_candidate (
    id                    CHAR(36) PRIMARY KEY,
    source_system         VARCHAR(64) NOT NULL,
    session_id            VARCHAR(128) NOT NULL,
    source_watermark      BIGINT NOT NULL,
    creator_user_id       BIGINT NOT NULL,
    creator_user_name     VARCHAR(255) NOT NULL DEFAULT '' COMMENT '登记时的用户姓名快照，真实姓名优先、账号名兜底',
    feedback_category     VARCHAR(32) NOT NULL,
    requirement_type      VARCHAR(32) NOT NULL,
    source_content         TEXT NOT NULL,
    ai_optimized_content   TEXT NOT NULL,
    user_rewritten_content TEXT NULL,
    confidence            DECIMAL(5, 4) NOT NULL,
    classification_reason VARCHAR(255) NOT NULL DEFAULT '',
    page_url              VARCHAR(1000) NOT NULL DEFAULT '',
    page_title            VARCHAR(255) NOT NULL DEFAULT '',
    candidate_status      VARCHAR(32) NOT NULL DEFAULT 'DETECTED',
    detected_at           BIGINT NOT NULL,
    create_time           BIGINT NOT NULL,
    update_time           BIGINT NOT NULL,
    UNIQUE KEY uk_assistant_feedback_source (source_system, session_id, source_watermark),
    KEY idx_assistant_feedback_category (feedback_category, candidate_status, detected_at),
    KEY idx_assistant_feedback_creator (creator_user_id, detected_at),
    KEY idx_assistant_feedback_creator_name (creator_user_name, detected_at),
    KEY idx_assistant_feedback_session_owner
        (creator_user_id, session_id, feedback_category, detected_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='彩虹胶囊自动识别的 Bug、优化建议和需求反馈候选主表';

CREATE TABLE IF NOT EXISTS assistant_feedback_candidate_revision (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    candidate_id      CHAR(36) NOT NULL,
    revision_no       INT NOT NULL,
    revision_source   VARCHAR(16) NOT NULL,
    editor_user_id    BIGINT NULL,
    feedback_category VARCHAR(32) NOT NULL,
    requirement_type  VARCHAR(32) NOT NULL,
    feedback_content  TEXT NOT NULL,
    create_time       BIGINT NOT NULL,
    UNIQUE KEY uk_assistant_feedback_revision (candidate_id, revision_no),
    KEY idx_assistant_feedback_revision_list (candidate_id, revision_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='反馈候选的 AI 原稿及用户历次修订记录';

CREATE TABLE IF NOT EXISTS assistant_feedback_candidate_attachment (
    candidate_id  CHAR(36) NOT NULL,
    attachment_id VARCHAR(100) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type     VARCHAR(100) NOT NULL,
    size_bytes    BIGINT NOT NULL,
    create_time   BIGINT NOT NULL,
    PRIMARY KEY (candidate_id, attachment_id),
    KEY idx_assistant_feedback_attachment (attachment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='反馈候选关联的会话图片与附件元数据';
