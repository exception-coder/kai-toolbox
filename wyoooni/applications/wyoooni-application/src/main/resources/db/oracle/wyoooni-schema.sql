CREATE TABLE wy_oauth_state (
    id VARCHAR2(64 CHAR) NOT NULL,
    return_to VARCHAR2(1024 CHAR) NOT NULL,
    expires_at NUMBER(19) NOT NULL,
    consumed_at NUMBER(19),
    create_time NUMBER(19) NOT NULL,
    update_time NUMBER(19) NOT NULL,
    CONSTRAINT pk_wy_oauth_state PRIMARY KEY (id)
);

CREATE TABLE wy_wechat_session (
    id VARCHAR2(64 CHAR) NOT NULL,
    subject_hash VARCHAR2(128 CHAR) NOT NULL,
    expires_at NUMBER(19) NOT NULL,
    last_seen_at NUMBER(19) NOT NULL,
    create_time NUMBER(19) NOT NULL,
    update_time NUMBER(19) NOT NULL,
    CONSTRAINT pk_wy_wechat_session PRIMARY KEY (id)
);

CREATE INDEX idx_wy_session_subject ON wy_wechat_session(subject_hash);

CREATE TABLE wy_account_binding (
    id VARCHAR2(64 CHAR) NOT NULL,
    account_id VARCHAR2(128 CHAR) NOT NULL,
    username VARCHAR2(128 CHAR) NOT NULL,
    display_name VARCHAR2(256 CHAR) NOT NULL,
    business_party_id VARCHAR2(128 CHAR) NOT NULL,
    business_party_name VARCHAR2(256 CHAR) NOT NULL,
    source_system VARCHAR2(32 CHAR) NOT NULL,
    active NUMBER(1) DEFAULT 1 NOT NULL,
    create_time NUMBER(19) NOT NULL,
    update_time NUMBER(19) NOT NULL,
    CONSTRAINT pk_wy_account_binding PRIMARY KEY (id),
    CONSTRAINT uk_wy_binding_account UNIQUE (account_id, source_system),
    CONSTRAINT ck_wy_binding_active CHECK (active IN (0, 1))
);
