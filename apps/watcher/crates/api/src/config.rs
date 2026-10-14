//! Configuration, only from the environment variables of contract §8 (rules §7.5). A bad value
//! stops the service at start. Errors name the variable, never its value, because two of them
//! are secrets.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use sealed_core::audit::is_origin_only;
use sealed_core::wire::Network;

#[derive(Clone)]
pub struct Config {
    pub network: Network,
    pub inbox_id: String,
    pub allowed_origins: Vec<String>,
    pub sources: Vec<String>,
    pub poll_seconds: u64,
    /// Argon2id PHC string of the setup secret (rules §1.4).
    pub setup_secret_hash: String,
    pub db_path: String,
    pub db_key: [u8; 32],
    pub port: u16,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
#[error("configuration variable {0} is missing or invalid")]
pub struct ConfigError(pub &'static str);

/// `[a-z0-9_-]{1,32}` (contract §4.1).
pub fn valid_inbox_id(id: &str) -> bool {
    (1..=32).contains(&id.len())
        && id
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_' || c == b'-')
}

/// A browser origin: `https://host[:port]`, or `http://localhost` / `http://127.0.0.1` for local
/// development. No path, user name or password.
fn valid_browser_origin(o: &str) -> bool {
    let rest = if let Some(r) = o.strip_prefix("https://") {
        r
    } else if let Some(r) = o.strip_prefix("http://") {
        if !(r.starts_with("localhost") || r.starts_with("127.0.0.1")) {
            return false;
        }
        r
    } else {
        return false;
    };
    !rest.is_empty()
        && rest
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b".-:".contains(&c))
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_vars(|name| std::env::var(name).ok())
    }

    pub fn from_vars(get: impl Fn(&str) -> Option<String>) -> Result<Self, ConfigError> {
        let need = |name: &'static str| {
            get(name)
                .filter(|v| !v.trim().is_empty())
                .ok_or(ConfigError(name))
        };
        let list = |value: String| -> Vec<String> {
            value
                .split(',')
                .map(|s| s.trim().to_owned())
                .filter(|s| !s.is_empty())
                .collect()
        };

        let network = match need("SEALED_NETWORK")?.as_str() {
            "test" => Network::Test,
            "main" => Network::Main,
            _ => return Err(ConfigError("SEALED_NETWORK")),
        };
        let inbox_id = need("SEALED_INBOX_ID")?;
        if !valid_inbox_id(&inbox_id) {
            return Err(ConfigError("SEALED_INBOX_ID"));
        }
        let allowed_origins = list(need("ALLOWED_ORIGINS")?);
        if allowed_origins.is_empty() || !allowed_origins.iter().all(|o| valid_browser_origin(o)) {
            return Err(ConfigError("ALLOWED_ORIGINS"));
        }
        // At least 2 on main (FR-12), 1 allowed on test (C-21). Origin only (C-14).
        let sources = list(need("SEALED_LIGHTWALLETD_URLS")?);
        let minimum = if network == Network::Main { 2 } else { 1 };
        if sources.len() < minimum
            || !sources
                .iter()
                .all(|s| is_origin_only(s) && s.starts_with("https://"))
        {
            return Err(ConfigError("SEALED_LIGHTWALLETD_URLS"));
        }
        if get("SEALED_CONFIRMATIONS").is_some_and(|v| v.trim() != "3") {
            return Err(ConfigError("SEALED_CONFIRMATIONS"));
        }
        let poll_seconds = match get("SEALED_POLL_SECONDS") {
            None => 30,
            Some(v) => v
                .trim()
                .parse()
                .ok()
                .filter(|s| (5..=600).contains(s))
                .ok_or(ConfigError("SEALED_POLL_SECONDS"))?,
        };
        let setup_secret_hash = need("SEALED_SETUP_SECRET_HASH")?;
        if argon2::PasswordHash::new(&setup_secret_hash).is_err()
            || !setup_secret_hash.starts_with("$argon2id$")
        {
            return Err(ConfigError("SEALED_SETUP_SECRET_HASH"));
        }
        let db_path = need("SEALED_DB_PATH")?;
        let db_key: [u8; 32] = STANDARD
            .decode(need("SEALED_DB_KEY")?.trim())
            .ok()
            .and_then(|k| k.try_into().ok())
            .ok_or(ConfigError("SEALED_DB_KEY"))?;
        let port = match get("PORT") {
            None => 8080,
            Some(v) => v.trim().parse().map_err(|_| ConfigError("PORT"))?,
        };
        Ok(Self {
            network,
            inbox_id,
            allowed_origins,
            sources,
            poll_seconds,
            setup_secret_hash,
            db_path,
            db_key,
            port,
        })
    }

    pub fn zcash_network(&self) -> zcash_protocol::consensus::Network {
        match self.network {
            Network::Test => zcash_protocol::consensus::Network::TestNetwork,
            Network::Main => zcash_protocol::consensus::Network::MainNetwork,
        }
    }
}
