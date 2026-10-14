//! Build check of rules §6.3 (NFR-1, NFR-2): no log call in any crate names a sensitive field.
//! Matches whole words only, so `skip` does not count as `ip`.

use std::fs;
use std::path::{Path, PathBuf};

const BANNED: &[&str] = &["ip", "user_agent", "token", "secret", "memo", "ufvk"];
const LOG_MACROS: &[&str] = &["trace!", "debug!", "info!", "warn!", "error!", "event!", "span!"];

fn rust_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if path.file_name().is_some_and(|n| n != "target") {
                rust_files(&path, out);
            }
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

/// Every log macro call, from the macro name to its closing parenthesis.
fn log_calls(source: &str) -> Vec<String> {
    let mut calls = Vec::new();
    for mac in LOG_MACROS {
        let mut rest = source;
        while let Some(i) = rest.find(mac) {
            let after = &rest[i + mac.len()..];
            let mut depth = 0usize;
            let mut end = after.len();
            for (j, c) in after.char_indices() {
                match c {
                    '(' => depth += 1,
                    ')' => {
                        depth = depth.saturating_sub(1);
                        if depth == 0 {
                            end = j + 1;
                            break;
                        }
                    }
                    _ => {}
                }
            }
            calls.push(after[..end].to_owned());
            rest = &after[end..];
        }
    }
    calls
}

fn words(text: &str) -> impl Iterator<Item = String> + '_ {
    text.split(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
        .filter(|w| !w.is_empty())
        .map(str::to_ascii_lowercase)
}

fn offending(call: &str) -> Option<String> {
    words(call).find(|w| BANNED.contains(&w.as_str()) || w.split('_').any(|part| BANNED.contains(&part) && part != "user"))
}

#[test]
fn no_log_call_names_a_sensitive_field() {
    let crates = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let mut files = Vec::new();
    rust_files(&crates, &mut files);
    assert!(files.len() > 5, "the scan must see the workspace sources");
    let mut found = Vec::new();
    for file in files {
        if file.ends_with("log_grep.rs") {
            continue;
        }
        let text = fs::read_to_string(&file).unwrap();
        for call in log_calls(&text) {
            if let Some(word) = offending(&call) {
                found.push(format!("{}: `{word}` in {call}", file.display()));
            }
        }
    }
    assert!(found.is_empty(), "sensitive words in log calls:\n{}", found.join("\n"));
}

#[test]
fn the_check_catches_what_it_must_and_ignores_lookalikes() {
    assert!(offending(r#"("client ip", ip = %addr)"#).is_some());
    assert!(offending(r#"(token_hash = ?h)"#).is_some());
    assert!(offending(r#"(memo = ?m)"#).is_some());
    assert!(offending(r#"(ufvk = %k)"#).is_some());
    assert!(offending(r#"(user_agent = %ua)"#).is_some());
    assert!(offending(r#"(setup_secret = %s)"#).is_some());
    assert!(offending(r#"(height = h, "skip this block")"#).is_none());
    assert!(offending(r#"(count = n, "scanned")"#).is_none());
    assert_eq!(log_calls(r#"tracing::warn!(height = h, "reorg"); x"#), vec![r#"(height = h, "reorg")"#]);
}
