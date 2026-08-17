CREATE TABLE wy_oauth_state (
    id VARCHAR2(64) PRIMARY KEY,
    return_to VARCHAR2(1000) NOT NULL,
    expires_at NUMBER(19) NOT NULL,
    consumed_at NUMBER(19),
    create_time NUMBER(19) NOT NULL,
    update_time NUMBER(19) NOT NULL
);

CREATE TABLE wy_wechat_session (
    id VARCHAR2(64) PRIMARY KEY,
    subject_hash VARCHAR2(64) NOT NULL,
    expires_at NUMBER(19) NOT NULL,
    last_seen_at NUMBER(19) NOT NULL,
    create_time NUMBER(19) NOT NULL,
    update_time NUMBER(19) NOT NULL
);

CREATE TABLE wy_account_binding (
    id VARCHAR2(64) PRIMARY KEY,
    account_id VARCHAR2(128) NOT NULL,
    username VARCHAR2(128) NOT NULL,
    display_name VARCHAR2(200) NOT NULL,
    business_party_id VARCHAR2(128) NOT NULL,
    business_party_name VARCHAR2(300) NOT NULL,
    source_system VARCHAR2(32) NOT NULL,
    active NUMBER(1) DEFAULT 1 NOT NULL,
    create_time NUMBER(19) NOT NULL,
    update_time NUMBER(19) NOT NULL,
    CONSTRAINT uq_wy_account UNIQUE (account_id, source_system)
);

CREATE INDEX idx_wy_session_subject ON wy_wechat_session(subject_hash);
