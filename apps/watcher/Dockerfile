# Sealed watcher and Inbox API (rules §9.1, B-17). Multi-stage, pinned by digest, non-root.
# Build from this folder: docker build -t sealed-watcher apps/watcher

# Build stage: the Rust version matches rust-toolchain.toml (1.99.0).
FROM rust:1.99.0-slim-bookworm@sha256:2c3a22f0a5533ea2dd5a16627bc841228151faa2d4de2644ac9987e4a2f1f2fa AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock clippy.toml ./
COPY crates ./crates
# --locked: exactly the versions in Cargo.lock (NFR-9). SQLite is compiled in (rusqlite "bundled").
RUN cargo build --release --locked --package sealed-api --bin sealed

# Runtime stage: only the binary. TLS roots are compiled in (webpki), so no system CA bundle is needed.
FROM debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin sealed \
    && mkdir /data \
    && chown sealed:sealed /data
COPY --from=build /src/target/release/sealed /usr/local/bin/sealed
USER sealed
# The Railway volume is mounted at /data. Every other variable comes from contract §8.
ENV SEALED_DB_PATH=/data/sealed.db \
    PORT=8080
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/sealed"]
