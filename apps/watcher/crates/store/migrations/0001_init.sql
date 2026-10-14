-- 0001: the five app tables of api-contract §5 and the Architecture data model, plus the
-- block hashes the watcher needs to detect a reorg (B-08). Never edit after release (rules §5.2).
-- Nothing here holds tip text, a desk private key, a passphrase, a sender IP or a user agent (NFR-2).

-- One row per inbox. The viewing key is stored only encrypted with SEALED_DB_KEY (B-07).
CREATE TABLE inbox (
    id               TEXT    PRIMARY KEY,
    name             TEXT    NOT NULL,
    network          TEXT    NOT NULL CHECK (network IN ('test', 'main')),
    address          TEXT    NOT NULL,
    desk_public_key  TEXT    NOT NULL,
    fingerprint      TEXT    NOT NULL,
    ufvk_sealed      BLOB    NOT NULL,
    tip_floor_zat    INTEGER NOT NULL CHECK (tip_floor_zat BETWEEN 10000 AND 100000000),
    birthday_height  INTEGER NOT NULL CHECK (birthday_height >= 0),
    scanned_height   INTEGER NOT NULL CHECK (scanned_height >= 0),
    last_seq         INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL
) STRICT;

-- One row per received output with its 512 memo bytes as received (FR-12, FR-13).
-- below_floor is computed against the current floor at response time (contract §5.3).
CREATE TABLE tip (
    id              TEXT    PRIMARY KEY,
    inbox_id        TEXT    NOT NULL REFERENCES inbox (id) DEFERRABLE INITIALLY DEFERRED,
    seq             INTEGER NOT NULL,
    txid            TEXT    NOT NULL CHECK (length(txid) = 64),
    output_index    INTEGER NOT NULL CHECK (output_index >= 0),
    height          INTEGER NOT NULL,
    block_time_at   TEXT    NOT NULL,
    seen_at         TEXT    NOT NULL,
    amount_zat      INTEGER NOT NULL CHECK (amount_zat >= 0),
    confirmations   INTEGER NOT NULL CHECK (confirmations BETWEEN 0 AND 10),
    chain_state     TEXT    NOT NULL CHECK (chain_state IN ('pending', 'confirmed', 'orphaned')),
    format_ok       INTEGER NOT NULL CHECK (format_ok IN (0, 1)),
    memo            BLOB    CHECK (memo IS NULL OR length(memo) = 512),
    UNIQUE (inbox_id, txid, output_index),
    UNIQUE (inbox_id, seq)
) STRICT;

-- Desk tokens, stored only as BLAKE2b-256 hashes (rules §1.4).
CREATE TABLE desk_token (
    token_hash  BLOB PRIMARY KEY CHECK (length(token_hash) = 32),
    inbox_id    TEXT NOT NULL REFERENCES inbox (id) DEFERRABLE INITIALLY DEFERRED,
    created_at  TEXT NOT NULL,
    revoked_at  TEXT
) STRICT;

-- Health of each chain server, named by origin only (C-14, FR-18).
CREATE TABLE sync_state (
    origin           TEXT    PRIMARY KEY,
    ok               INTEGER NOT NULL CHECK (ok IN (0, 1)),
    tip_height       INTEGER,
    last_checked_at  TEXT
) STRICT;

-- Recent block hashes on the chain the watcher follows. Public chain data, used to find the
-- fork height on a reorg (B-08, FR-14). Pruned to the last few hundred blocks.
CREATE TABLE chain_block (
    height  INTEGER PRIMARY KEY,
    hash    BLOB    NOT NULL CHECK (length(hash) = 32)
) STRICT;

-- Hash-chained audit log (contract §5.6, FR-20). Written in the same transaction as the change
-- it records. Never updated. Deleted only after its inbox row is gone (C-13).
CREATE TABLE audit_log (
    inbox_id      TEXT    NOT NULL REFERENCES inbox (id) DEFERRABLE INITIALLY DEFERRED,
    seq           INTEGER NOT NULL CHECK (seq >= 1),
    at            TEXT    NOT NULL,
    type          TEXT    NOT NULL,
    actor         TEXT    NOT NULL CHECK (actor IN ('setup', 'desk', 'watcher')),
    details_json  TEXT    NOT NULL,
    prev_hash     TEXT    NOT NULL CHECK (length(prev_hash) = 64),
    hash          TEXT    NOT NULL CHECK (length(hash) = 64),
    PRIMARY KEY (inbox_id, seq)
) STRICT;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN
    SELECT RAISE(ABORT, 'audit entries are never updated');
END;

CREATE TRIGGER audit_log_delete_only_with_inbox BEFORE DELETE ON audit_log
WHEN EXISTS (SELECT 1 FROM inbox WHERE id = OLD.inbox_id)
BEGIN
    SELECT RAISE(ABORT, 'audit entries are deleted only with their inbox');
END;
