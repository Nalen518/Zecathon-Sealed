//! Sealed store: SQLite on the Railway volume (rules §5, B-02, B-14).
//!
//! - Versioned migrations, each in one transaction, run at open. Never edit a released one.
//! - Every change and its audit entry are written in the same transaction (§5.6). Write
//!   transactions are IMMEDIATE, so the API and the watcher, each with its own connection, queue
//!   for the write lock instead of failing halfway (busy timeout 5 s).
//! - `seq` bumps on every tip insert and every change to `confirmations`, `chain_state` or
//!   `below_floor` (contract §6.5).

pub mod seal;

use blake2::{Blake2b, Digest, digest::consts::U32};
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};
use sealed_core::audit::{self, Actor, AuditError, Entry, Event};
use sealed_core::memo::{self, MEMO_BYTES};
use sealed_core::status::{self, ChainState};
use sealed_core::wire::{AuditPage, Counts, Inbox, Network, Tip, TipsPage};
use zeroize::Zeroizing;

pub use seal::DbKey;

const MIGRATIONS: &[&str] = &[include_str!("../migrations/0001_init.sql")];

/// Blocks kept in `chain_block` below the scanned height, for finding a fork. Above the deepest
/// reorg seen on testnet (317 blocks, B-29).
pub const KEEP_BLOCKS: u32 = 1_000;

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("database error")]
    Sqlite(#[from] rusqlite::Error),
    #[error(transparent)]
    Seal(#[from] seal::SealError),
    #[error(transparent)]
    Audit(#[from] AuditError),
    #[error("stored audit details are not valid JSON")]
    Json,
    #[error("an inbox already exists")]
    InboxExists,
    #[error("not found")]
    NotFound,
    #[error("database was written by a newer version of Sealed")]
    NewerSchema,
}

pub type Result<T> = std::result::Result<T, StoreError>;

/// Registration data, already checked by the API (contract §6.3).
pub struct NewInbox<'a> {
    pub id: &'a str,
    pub name: &'a str,
    pub network: Network,
    pub address: &'a str,
    pub desk_public_key: &'a str,
    pub fingerprint: &'a str,
    pub ufvk: &'a str,
    pub tip_floor_zat: u64,
    pub birthday_height: u32,
    pub created_at: &'a str,
}

/// An inbox with the watcher's scan position. Never holds the viewing key.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InboxRecord {
    pub inbox: Inbox,
    pub birthday_height: u32,
    pub scanned_height: u32,
}

/// One received output as the watcher found it on chain (FR-12).
pub struct NewTip<'a> {
    pub txid: &'a str,
    pub output_index: u32,
    pub height: u32,
    pub block_time_at: &'a str,
    pub seen_at: &'a str,
    pub amount_zat: u64,
    pub confirmations: u32,
    /// The 512 memo bytes as received. A ZIP 302 "no memo" is stored as NULL (C-16).
    pub memo: &'a [u8; MEMO_BYTES],
}

/// One chain server as last checked (FR-18). Named by origin only (C-14).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SourceRow {
    pub origin: String,
    pub ok: bool,
    pub tip_height: Option<u32>,
    pub last_checked_at: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TipFilter {
    Visible,
    BelowFloor,
    All,
}

/// Opaque tip id, the same after a rescan so a rebuilt volume keeps the desk's links (§4.1).
pub fn tip_id(inbox_id: &str, txid: &str, output_index: u32) -> String {
    let mut h = Blake2b::<U32>::new();
    h.update(b"sealed/tip/v1\0");
    h.update(inbox_id.as_bytes());
    h.update(b"\0");
    h.update(txid.as_bytes());
    h.update(output_index.to_be_bytes());
    let hex: String = h.finalize().iter().map(|b| format!("{b:02x}")).collect();
    format!("tip_{}", &hex[..26])
}

/// Constant-time equality for token hashes (rules §1.4).
fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

pub struct Store {
    conn: Connection,
    key: DbKey,
}

impl Store {
    /// Opens the database at `SEALED_DB_PATH`, in WAL mode, and runs pending migrations.
    pub fn open(path: &str, key: DbKey) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        Self::init(conn, key)
    }

    /// A private in-memory database, for tests.
    pub fn open_in_memory(key: DbKey) -> Result<Self> {
        Self::init(Connection::open_in_memory()?, key)
    }

    fn init(mut conn: Connection, key: DbKey) -> Result<Self> {
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        migrate(&mut conn)?;
        Ok(Self { conn, key })
    }

    pub fn schema_version(&self) -> Result<u32> {
        Ok(self
            .conn
            .pragma_query_value(None, "user_version", |r| r.get(0))?)
    }

    // ---------- Inbox ----------

    /// Creates the inbox and its `inbox_created` entry. Single tenant: a second one is refused.
    pub fn create_inbox(&mut self, new: &NewInbox) -> Result<Inbox> {
        let sealed = seal::seal_ufvk(&self.key, new.id, new.ufvk)?;
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let exists: bool = tx.query_row("SELECT EXISTS (SELECT 1 FROM inbox)", [], |r| r.get(0))?;
        if exists {
            return Err(StoreError::InboxExists);
        }
        tx.execute(
            "INSERT INTO inbox (id, name, network, address, desk_public_key, fingerprint, ufvk_sealed,
                tip_floor_zat, birthday_height, scanned_height, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?10)",
            params![
                new.id,
                new.name,
                network_str(new.network),
                new.address,
                new.desk_public_key,
                new.fingerprint,
                sealed,
                new.tip_floor_zat,
                new.birthday_height,
                new.created_at
            ],
        )?;
        append_audit(
            &tx,
            new.id,
            new.created_at,
            Actor::Setup,
            &Event::InboxCreated {
                fingerprint: new.fingerprint.to_owned(),
                tip_floor_zat: new.tip_floor_zat,
                network: network_str(new.network).to_owned(),
                birthday_height: new.birthday_height.into(),
            },
        )?;
        let record = inbox_record(&tx, new.id)?.ok_or(StoreError::NotFound)?;
        tx.commit()?;
        Ok(record.inbox)
    }

    pub fn inbox(&self, id: &str) -> Result<Option<InboxRecord>> {
        inbox_record(&self.conn, id)
    }

    /// The decrypted viewing key, wiped from memory when dropped. Only the watcher calls this.
    pub fn viewing_key(&self, id: &str) -> Result<Zeroizing<String>> {
        let sealed: Vec<u8> = self
            .conn
            .query_row("SELECT ufvk_sealed FROM inbox WHERE id = ?1", [id], |r| {
                r.get(0)
            })
            .optional()?
            .ok_or(StoreError::NotFound)?;
        Ok(seal::open_ufvk(&self.key, id, &sealed)?)
    }

    /// Changes the tip floor, bumps `seq` of every tip whose `below_floor` flips, and writes
    /// `floor_changed` (contract §6.5, §6.7).
    pub fn set_floor(&mut self, id: &str, to_zat: u64, at: &str) -> Result<Inbox> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let from_zat: u64 = tx
            .query_row("SELECT tip_floor_zat FROM inbox WHERE id = ?1", [id], |r| {
                r.get(0)
            })
            .optional()?
            .ok_or(StoreError::NotFound)?;
        if from_zat != to_zat {
            tx.execute(
                "UPDATE inbox SET tip_floor_zat = ?2 WHERE id = ?1",
                params![id, to_zat],
            )?;
            let flipped: Vec<String> = {
                let mut stmt = tx.prepare(
                    "SELECT id FROM tip WHERE inbox_id = ?1
                       AND (amount_zat < ?2) != (amount_zat < ?3) ORDER BY seq",
                )?;
                stmt.query_map(params![id, from_zat, to_zat], |r| r.get(0))?
                    .collect::<rusqlite::Result<_>>()?
            };
            for tip in flipped {
                bump_seq(&tx, id, &tip)?;
            }
            append_audit(
                &tx,
                id,
                at,
                Actor::Desk,
                &Event::FloorChanged { from_zat, to_zat },
            )?;
        }
        let record = inbox_record(&tx, id)?.ok_or(StoreError::NotFound)?;
        tx.commit()?;
        Ok(record.inbox)
    }

    /// Removes the inbox, viewing key, token hashes, tips and audit entries in one transaction
    /// (FR-17, T-9, C-13). Chain data (`chain_block`, `sync_state`) is public and not per inbox.
    pub fn delete_inbox(&mut self, id: &str) -> Result<()> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        if tx.execute("DELETE FROM inbox WHERE id = ?1", [id])? == 0 {
            return Err(StoreError::NotFound);
        }
        tx.execute("DELETE FROM tip WHERE inbox_id = ?1", [id])?;
        tx.execute("DELETE FROM desk_token WHERE inbox_id = ?1", [id])?;
        tx.execute("DELETE FROM audit_log WHERE inbox_id = ?1", [id])?;
        tx.commit()?;
        Ok(())
    }

    // ---------- Desk tokens ----------

    /// Stores a new token hash, revokes every earlier token, and writes `token_issued` (§6.4).
    pub fn issue_token(
        &mut self,
        id: &str,
        token_hash: &[u8; 32],
        actor: Actor,
        at: &str,
    ) -> Result<()> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let known: bool = tx.query_row(
            "SELECT EXISTS (SELECT 1 FROM inbox WHERE id = ?1)",
            [id],
            |r| r.get(0),
        )?;
        if !known {
            return Err(StoreError::NotFound);
        }
        let rotated: bool = tx.query_row(
            "SELECT EXISTS (SELECT 1 FROM desk_token WHERE inbox_id = ?1)",
            [id],
            |r| r.get(0),
        )?;
        tx.execute(
            "UPDATE desk_token SET revoked_at = ?2 WHERE inbox_id = ?1 AND revoked_at IS NULL",
            params![id, at],
        )?;
        tx.execute(
            "INSERT INTO desk_token (token_hash, inbox_id, created_at) VALUES (?1, ?2, ?3)",
            params![token_hash.as_slice(), id, at],
        )?;
        let token_id: String = token_hash[..4].iter().map(|b| format!("{b:02x}")).collect();
        append_audit(
            &tx,
            id,
            at,
            actor,
            &Event::TokenIssued { token_id, rotated },
        )?;
        tx.commit()?;
        Ok(())
    }

    /// Whether `token_hash` is the inbox's current token. Compared in constant time.
    pub fn token_is_current(&self, id: &str, token_hash: &[u8; 32]) -> Result<bool> {
        let mut stmt = self.conn.prepare(
            "SELECT token_hash FROM desk_token WHERE inbox_id = ?1 AND revoked_at IS NULL",
        )?;
        let current: Vec<Vec<u8>> = stmt
            .query_map([id], |r| r.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        Ok(current
            .iter()
            .fold(false, |found, h| found | ct_eq(h, token_hash)))
    }

    // ---------- Tips ----------

    /// Inserts a tip once (FR-13). Returns its id if it was new, `None` if it was already stored.
    pub fn insert_tip(&mut self, id: &str, t: &NewTip) -> Result<Option<String>> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let tip = tip_id(id, t.txid, t.output_index);
        let state_now: Option<String> = tx
            .query_row("SELECT chain_state FROM tip WHERE id = ?1", [&tip], |r| {
                r.get(0)
            })
            .optional()?;
        let confirmations = t.confirmations.min(status::CONFIRMATIONS_CAP);
        match state_now.as_deref() {
            None => {}
            // Mined again on the new chain after a reorg: back to pending or confirmed at its new
            // height. The contract has no own event for this, so it is a new `tip_received`.
            Some("orphaned") => {
                let state = status::chain_state(confirmations);
                tx.execute(
                    "UPDATE tip SET height = ?2, block_time_at = ?3, confirmations = ?4, chain_state = ?5
                     WHERE id = ?1",
                    params![tip, t.height, t.block_time_at, confirmations, state.as_str()],
                )?;
                bump_seq(&tx, id, &tip)?;
                let format_ok: bool =
                    tx.query_row("SELECT format_ok FROM tip WHERE id = ?1", [&tip], |r| {
                        r.get(0)
                    })?;
                append_audit(
                    &tx,
                    id,
                    t.seen_at,
                    Actor::Watcher,
                    &Event::TipReceived {
                        tip_id: tip.clone(),
                        txid: t.txid.to_owned(),
                        output_index: t.output_index.into(),
                        amount_zat: t.amount_zat,
                        height: t.height.into(),
                        format_ok,
                    },
                )?;
                tx.commit()?;
                return Ok(Some(tip));
            }
            Some(_) => return Ok(None),
        }
        let state = status::chain_state(confirmations);
        let format_ok = memo::format_ok(t.memo);
        let stored_memo = memo::memo_b64(t.memo).map(|_| t.memo.to_vec());
        let seq = next_seq(&tx, id)?;
        tx.execute(
            "INSERT INTO tip (id, inbox_id, seq, txid, output_index, height, block_time_at, seen_at,
                amount_zat, confirmations, chain_state, format_ok, memo)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                tip,
                id,
                seq,
                t.txid,
                t.output_index,
                t.height,
                t.block_time_at,
                t.seen_at,
                t.amount_zat,
                confirmations,
                state.as_str(),
                format_ok,
                stored_memo
            ],
        )?;
        append_audit(
            &tx,
            id,
            t.seen_at,
            Actor::Watcher,
            &Event::TipReceived {
                tip_id: tip.clone(),
                txid: t.txid.to_owned(),
                output_index: t.output_index.into(),
                amount_zat: t.amount_zat,
                height: t.height.into(),
                format_ok,
            },
        )?;
        if state == ChainState::Confirmed {
            append_audit(
                &tx,
                id,
                t.seen_at,
                Actor::Watcher,
                &Event::TipConfirmed {
                    tip_id: tip.clone(),
                    txid: t.txid.to_owned(),
                    confirmations: confirmations.into(),
                },
            )?;
        }
        tx.commit()?;
        Ok(Some(tip))
    }

    /// Updates confirmations of every non-orphaned tip against the chain tip. Bumps `seq` only on
    /// a real change, and writes `tip_confirmed` when a tip reaches 3 (FR-14, C-17).
    pub fn refresh_confirmations(&mut self, id: &str, chain_tip: u32, at: &str) -> Result<usize> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let rows: Vec<(String, String, u32, u32, String)> = {
            let mut stmt = tx.prepare(
                "SELECT id, txid, height, confirmations, chain_state FROM tip
                 WHERE inbox_id = ?1 AND chain_state != 'orphaned' AND confirmations < ?2",
            )?;
            stmt.query_map(params![id, status::CONFIRMATIONS_CAP], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })?
            .collect::<rusqlite::Result<_>>()?
        };
        let mut changed = 0;
        for (tip, txid, height, old, old_state) in rows {
            let now = status::confirmations(height, chain_tip);
            if now == old {
                continue;
            }
            let state = status::chain_state(now);
            tx.execute(
                "UPDATE tip SET confirmations = ?2, chain_state = ?3 WHERE id = ?1",
                params![tip, now, state.as_str()],
            )?;
            bump_seq(&tx, id, &tip)?;
            if state == ChainState::Confirmed && old_state != state.as_str() {
                append_audit(
                    &tx,
                    id,
                    at,
                    Actor::Watcher,
                    &Event::TipConfirmed {
                        tip_id: tip.clone(),
                        txid,
                        confirmations: now.into(),
                    },
                )?;
            }
            changed += 1;
        }
        tx.commit()?;
        Ok(changed)
    }

    /// Marks every tip above `fork_height` orphaned after a reorg. Never deletes them (FR-14).
    pub fn orphan_above(&mut self, id: &str, fork_height: u32, at: &str) -> Result<Vec<String>> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let rows: Vec<(String, String, u32)> = {
            let mut stmt = tx.prepare(
                "SELECT id, txid, height FROM tip
                 WHERE inbox_id = ?1 AND height > ?2 AND chain_state != 'orphaned' ORDER BY seq",
            )?;
            stmt.query_map(params![id, fork_height], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })?
            .collect::<rusqlite::Result<_>>()?
        };
        let mut ids = Vec::new();
        for (tip, txid, height) in rows {
            tx.execute(
                "UPDATE tip SET chain_state = 'orphaned' WHERE id = ?1",
                [&tip],
            )?;
            bump_seq(&tx, id, &tip)?;
            append_audit(
                &tx,
                id,
                at,
                Actor::Watcher,
                &Event::TipOrphaned {
                    tip_id: tip.clone(),
                    txid,
                    height: height.into(),
                },
            )?;
            ids.push(tip);
        }
        tx.commit()?;
        Ok(ids)
    }

    /// §6.5: tips changed after `after_seq`, ascending, plus counts over every tip.
    pub fn tips_page(
        &self,
        id: &str,
        after_seq: u64,
        filter: TipFilter,
        limit: u32,
    ) -> Result<TipsPage> {
        let floor = self.floor(id)?;
        let cond = match filter {
            TipFilter::Visible => "AND amount_zat >= ?3",
            TipFilter::BelowFloor => "AND amount_zat < ?3",
            TipFilter::All => "AND ?3 = ?3",
        };
        let sql = format!(
            "SELECT {TIP_COLUMNS} FROM tip WHERE inbox_id = ?1 AND seq > ?2 {cond} ORDER BY seq LIMIT ?4"
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let mut tips: Vec<Tip> = stmt
            .query_map(params![id, after_seq, floor, u64::from(limit) + 1], |r| {
                tip_from_row(r, floor)
            })?
            .collect::<rusqlite::Result<_>>()?;
        let has_more = tips.len() > limit as usize;
        tips.truncate(limit as usize);
        let next_seq = tips.last().map_or(after_seq, |t| t.seq);
        let (visible, below_floor): (u64, u64) = self.conn.query_row(
            "SELECT COALESCE(SUM(amount_zat >= ?2), 0), COALESCE(SUM(amount_zat < ?2), 0)
             FROM tip WHERE inbox_id = ?1",
            params![id, floor],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        Ok(TipsPage {
            tips,
            next_seq,
            has_more,
            counts: Counts {
                visible,
                below_floor,
            },
        })
    }

    /// §6.6
    pub fn tip(&self, id: &str, tip_id: &str) -> Result<Option<Tip>> {
        let floor = self.floor(id)?;
        let sql = format!("SELECT {TIP_COLUMNS} FROM tip WHERE inbox_id = ?1 AND id = ?2");
        Ok(self
            .conn
            .query_row(&sql, params![id, tip_id], |r| tip_from_row(r, floor))
            .optional()?)
    }

    fn floor(&self, id: &str) -> Result<u64> {
        self.conn
            .query_row("SELECT tip_floor_zat FROM inbox WHERE id = ?1", [id], |r| {
                r.get(0)
            })
            .optional()?
            .ok_or(StoreError::NotFound)
    }

    // ---------- Audit log ----------

    /// §6.10: entries after `after_seq`, ascending.
    pub fn audit_page(&self, id: &str, after_seq: u64, limit: u32) -> Result<AuditPage> {
        let total: u64 = self.conn.query_row(
            "SELECT COUNT(*) FROM audit_log WHERE inbox_id = ?1",
            [id],
            |r| r.get(0),
        )?;
        let mut stmt = self.conn.prepare(
            "SELECT seq, at, type, actor, details_json, prev_hash, hash FROM audit_log
             WHERE inbox_id = ?1 AND seq > ?2 ORDER BY seq LIMIT ?3",
        )?;
        let rows: Vec<(u64, String, String, String, String, String, String)> = stmt
            .query_map(params![id, after_seq, u64::from(limit) + 1], |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                ))
            })?
            .collect::<rusqlite::Result<_>>()?;
        let has_more = rows.len() > limit as usize;
        let mut entries = Vec::with_capacity(rows.len());
        for (seq, at, kind, actor, details, prev_hash, hash) in
            rows.into_iter().take(limit as usize)
        {
            let details = serde_json::from_str(&details).map_err(|_| StoreError::Json)?;
            entries.push(Entry {
                seq,
                at,
                kind,
                actor,
                details,
                prev_hash,
                hash,
            });
        }
        let next_seq = entries.last().map_or(after_seq, |e| e.seq);
        Ok(AuditPage {
            entries,
            next_seq,
            has_more,
            total,
        })
    }

    // ---------- Chain state ----------

    /// Records a chain server check. On a change of `ok`, writes `source_down` or `source_up` for
    /// every inbox, never on a retry that changes nothing (rules §4.8).
    pub fn record_source(
        &mut self,
        origin: &str,
        ok: bool,
        tip_height: Option<u32>,
        at: &str,
    ) -> Result<()> {
        if !audit::is_origin_only(origin) {
            return Err(StoreError::Audit(AuditError::Origin));
        }
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let was: Option<bool> = tx
            .query_row(
                "SELECT ok FROM sync_state WHERE origin = ?1",
                [origin],
                |r| r.get(0),
            )
            .optional()?;
        tx.execute(
            "INSERT INTO sync_state (origin, ok, tip_height, last_checked_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT (origin) DO UPDATE SET ok = ?2,
                tip_height = COALESCE(?3, tip_height), last_checked_at = ?4",
            params![origin, ok, tip_height, at],
        )?;
        let changed = match was {
            Some(prev) => prev != ok,
            None => !ok,
        };
        if changed {
            let inboxes: Vec<String> = {
                let mut stmt = tx.prepare("SELECT id FROM inbox")?;
                stmt.query_map([], |r| r.get(0))?
                    .collect::<rusqlite::Result<_>>()?
            };
            let event = if ok {
                Event::SourceUp {
                    origin: origin.to_owned(),
                }
            } else {
                Event::SourceDown {
                    origin: origin.to_owned(),
                }
            };
            for id in inboxes {
                append_audit(&tx, &id, at, Actor::Watcher, &event)?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    /// Every recorded chain server.
    pub fn sources(&self) -> Result<Vec<SourceRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT origin, ok, tip_height, last_checked_at FROM sync_state ORDER BY origin",
        )?;
        Ok(stmt
            .query_map([], |r| {
                Ok(SourceRow {
                    origin: r.get(0)?,
                    ok: r.get(1)?,
                    tip_height: r.get(2)?,
                    last_checked_at: r.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?)
    }

    /// Saves a scanned block's hash and moves the inbox's scan position (one transaction).
    pub fn put_scanned_block(&mut self, id: &str, height: u32, hash: &[u8; 32]) -> Result<()> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        tx.execute(
            "INSERT INTO chain_block (height, hash) VALUES (?1, ?2)
             ON CONFLICT (height) DO UPDATE SET hash = ?2",
            params![height, hash.as_slice()],
        )?;
        tx.execute(
            "UPDATE inbox SET scanned_height = ?2 WHERE id = ?1",
            params![id, height],
        )?;
        tx.execute(
            "DELETE FROM chain_block WHERE height < ?1",
            [height.saturating_sub(KEEP_BLOCKS)],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// Lowest height with a stored block hash, the deepest point a fork search can reach.
    pub fn oldest_block(&self) -> Result<Option<u32>> {
        Ok(self
            .conn
            .query_row("SELECT MIN(height) FROM chain_block", [], |r| r.get(0))?)
    }

    pub fn block_hash(&self, height: u32) -> Result<Option<[u8; 32]>> {
        let v: Option<Vec<u8>> = self
            .conn
            .query_row(
                "SELECT hash FROM chain_block WHERE height = ?1",
                [height],
                |r| r.get(0),
            )
            .optional()?;
        Ok(v.and_then(|b| b.try_into().ok()))
    }

    /// Rewinds after a reorg: drops block hashes above the fork and moves the scan position back.
    pub fn rewind_to(&mut self, id: &str, fork_height: u32) -> Result<()> {
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        tx.execute("DELETE FROM chain_block WHERE height > ?1", [fork_height])?;
        tx.execute(
            "UPDATE inbox SET scanned_height = MIN(scanned_height, ?2) WHERE id = ?1",
            params![id, fork_height],
        )?;
        tx.commit()?;
        Ok(())
    }
}

const TIP_COLUMNS: &str = "id, seq, txid, output_index, height, block_time_at, seen_at, amount_zat, \
                           confirmations, chain_state, format_ok, memo";

fn tip_from_row(r: &rusqlite::Row, floor: u64) -> rusqlite::Result<Tip> {
    let amount_zat: u64 = r.get(7)?;
    let format_ok: bool = r.get(10)?;
    let state = match r.get::<_, String>(9)?.as_str() {
        "confirmed" => ChainState::Confirmed,
        "orphaned" => ChainState::Orphaned,
        _ => ChainState::Pending,
    };
    let below_floor = status::below_floor(amount_zat, floor);
    let memo: Option<Vec<u8>> = r.get(11)?;
    let memo_b64 = memo
        .and_then(|m| <[u8; MEMO_BYTES]>::try_from(m).ok())
        .and_then(|m| memo::memo_b64(&m));
    Ok(Tip {
        id: r.get(0)?,
        seq: r.get(1)?,
        txid: r.get(2)?,
        output_index: r.get(3)?,
        height: Some(r.get(4)?),
        block_time_at: Some(r.get(5)?),
        seen_at: r.get(6)?,
        amount_zat,
        confirmations: Some(r.get(8)?),
        chain_state: state.into(),
        below_floor,
        format_ok,
        display_status: status::display_status(state, format_ok, below_floor).into(),
        memo_b64,
    })
}

fn network_str(n: Network) -> &'static str {
    match n {
        Network::Test => "test",
        Network::Main => "main",
    }
}

fn inbox_record(conn: &Connection, id: &str) -> Result<Option<InboxRecord>> {
    Ok(conn
        .query_row(
            "SELECT id, name, network, address, desk_public_key, fingerprint, tip_floor_zat,
                created_at, birthday_height, scanned_height FROM inbox WHERE id = ?1",
            [id],
            |r| {
                let network = if r.get::<_, String>(2)? == "main" {
                    Network::Main
                } else {
                    Network::Test
                };
                Ok(InboxRecord {
                    inbox: Inbox {
                        id: r.get(0)?,
                        name: r.get(1)?,
                        network,
                        address: r.get(3)?,
                        desk_public_key: r.get(4)?,
                        fingerprint: r.get(5)?,
                        tip_floor_zat: r.get(6)?,
                        created_at: r.get(7)?,
                    },
                    birthday_height: r.get(8)?,
                    scanned_height: r.get(9)?,
                })
            },
        )
        .optional()?)
}

fn next_seq(tx: &Transaction, id: &str) -> Result<u64> {
    tx.execute(
        "UPDATE inbox SET last_seq = last_seq + 1 WHERE id = ?1",
        [id],
    )?;
    Ok(
        tx.query_row("SELECT last_seq FROM inbox WHERE id = ?1", [id], |r| {
            r.get(0)
        })?,
    )
}

fn bump_seq(tx: &Transaction, id: &str, tip: &str) -> Result<()> {
    let seq = next_seq(tx, id)?;
    tx.execute("UPDATE tip SET seq = ?2 WHERE id = ?1", params![tip, seq])?;
    Ok(())
}

/// Appends one hash-chained entry inside the caller's transaction (§5.6).
fn append_audit(tx: &Transaction, id: &str, at: &str, actor: Actor, event: &Event) -> Result<()> {
    let last: Option<(u64, String)> = tx
        .query_row(
            "SELECT seq, hash FROM audit_log WHERE inbox_id = ?1 ORDER BY seq DESC LIMIT 1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    let (seq, prev) = last.map_or((1, audit::GENESIS_HASH.to_owned()), |(s, h)| (s + 1, h));
    let entry = audit::seal(seq, at, actor, event, &prev)?;
    tx.execute(
        "INSERT INTO audit_log (inbox_id, seq, at, type, actor, details_json, prev_hash, hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            entry.seq,
            entry.at,
            entry.kind,
            entry.actor,
            entry.details.to_string(),
            entry.prev_hash,
            entry.hash
        ],
    )?;
    Ok(())
}

fn migrate(conn: &mut Connection) -> Result<()> {
    let version: usize = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version > MIGRATIONS.len() {
        return Err(StoreError::NewerSchema);
    }
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(version) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", i + 1)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests;
