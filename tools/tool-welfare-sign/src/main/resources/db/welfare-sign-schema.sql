CREATE TABLE IF NOT EXISTS welfare_sign_config (
    id                 INTEGER PRIMARY KEY CHECK (id = 1),
    login_mode         TEXT    NOT NULL DEFAULT 'SMS',
    redirect_url       TEXT,
    login_image_url    TEXT,
    detail_image_url   TEXT,
    detail_title       TEXT    NOT NULL DEFAULT '节假日福利签收',
    detail_content     TEXT,
    popup_enabled      INTEGER NOT NULL DEFAULT 0,
    popup_title        TEXT,
    popup_content      TEXT,
    signature_notice   TEXT,
    extra_fields_json  TEXT,
    updated_at         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS welfare_sign_employee (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_no   TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    phone         TEXT,
    account       TEXT,
    password      TEXT,
    department    TEXT,
    extra_json    TEXT,
    enabled       INTEGER NOT NULL DEFAULT 1,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_welfare_sign_employee_no
    ON welfare_sign_employee(employee_no);

CREATE INDEX IF NOT EXISTS idx_welfare_sign_employee_phone
    ON welfare_sign_employee(phone);

CREATE INDEX IF NOT EXISTS idx_welfare_sign_employee_account
    ON welfare_sign_employee(account);

CREATE TABLE IF NOT EXISTS welfare_sign_record (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id     INTEGER NOT NULL,
    employee_no     TEXT    NOT NULL,
    name            TEXT    NOT NULL,
    phone           TEXT,
    department      TEXT,
    signature_data  TEXT    NOT NULL,
    extra_json      TEXT,
    signed_at       INTEGER NOT NULL,
    ip              TEXT,
    user_agent      TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_welfare_sign_record_employee
    ON welfare_sign_record(employee_id);

CREATE INDEX IF NOT EXISTS idx_welfare_sign_record_signed
    ON welfare_sign_record(signed_at DESC);
