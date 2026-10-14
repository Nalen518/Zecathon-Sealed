//! `sealed`: the one service (B-01). Reads configuration from the environment (contract §8),
//! opens the database on the volume, starts the watcher loop and serves the Inbox API.

use std::net::SocketAddr;
use std::sync::Arc;

use sealed_api::config::Config;
use sealed_api::{AppState, router, run_watcher};
use sealed_store::{DbKey, Store};

/// `sealed hash-secret`: reads a setup secret from standard input (never from the command line,
/// which would land in shell history) and prints its Argon2id hash for `SEALED_SETUP_SECRET_HASH`.
fn hash_secret() -> std::process::ExitCode {
    use argon2::password_hash::PasswordHasher;
    let mut secret = String::new();
    if std::io::stdin().read_line(&mut secret).is_err() || secret.trim().len() < 16 {
        eprintln!("Pipe a setup secret of at least 16 characters on standard input.");
        return std::process::ExitCode::FAILURE;
    }
    match argon2::Argon2::default().hash_password(secret.trim().as_bytes()) {
        Ok(hash) => {
            println!("{hash}");
            std::process::ExitCode::SUCCESS
        }
        Err(_) => std::process::ExitCode::FAILURE,
    }
}

fn main() -> std::process::ExitCode {
    if std::env::args().nth(1).as_deref() == Some("hash-secret") {
        return hash_secret();
    }
    serve();
    std::process::ExitCode::SUCCESS
}

#[tokio::main]
async fn serve() {
    tracing_subscriber::fmt()
        .with_ansi(false)
        .with_target(false)
        .init();

    let config = match Config::from_env() {
        Ok(c) => c,
        Err(e) => {
            // Names the variable, never its value.
            tracing::error!(error = %e, "configuration");
            std::process::exit(1);
        }
    };
    let store = match Store::open(&config.db_path, DbKey::new(config.db_key)) {
        Ok(s) => s,
        Err(_) => {
            tracing::error!("database could not be opened");
            std::process::exit(1);
        }
    };
    let port = config.port;
    tokio::spawn(run_watcher(config.clone()));

    let app = router(Arc::new(AppState::new(store, config)));
    let listener = match tokio::net::TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], port))).await
    {
        Ok(l) => l,
        Err(_) => {
            tracing::error!(port, "port could not be opened");
            std::process::exit(1);
        }
    };
    tracing::info!(port, version = sealed_api::VERSION, "listening");
    let served = axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        let _ = tokio::signal::ctrl_c().await;
    })
    .await;
    if served.is_err() {
        tracing::error!("server stopped with an error");
        std::process::exit(1);
    }
}
