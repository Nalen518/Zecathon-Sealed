//! Sealed chain: the watcher that reads the chain with a view-only key (rules §4, B-08).

pub mod detect;
pub mod health;
pub mod keys;
pub mod source;
pub mod watcher;

#[cfg(test)]
mod tests;
