//! Chain sources: the lightwalletd servers the watcher reads from (rules §4.1, §4.2, §1.9).
//! The only outbound traffic is gRPC over TLS to the configured origins.

use std::future::Future;

use tonic::transport::{Channel, ClientTlsConfig};
use zcash_client_backend::proto::compact_formats::CompactBlock;
use zcash_client_backend::proto::service::{
    BlockId, BlockRange, ChainSpec, PoolType, TxFilter,
    compact_tx_streamer_client::CompactTxStreamerClient,
};

/// A block height and its hash, in the byte order the server sends.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BlockRef {
    pub height: u32,
    pub hash: [u8; 32],
}

/// What a source failure looks like to the watcher. Never carries a server message, which could
/// echo a URL with credentials (C-14).
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum SourceError {
    #[error("chain server unreachable")]
    Unreachable,
    #[error("chain server answered something unexpected")]
    BadAnswer,
    #[error("block or transaction not found")]
    NotFound,
}

/// One chain server. `origin` is scheme, host and port only (C-14).
pub trait ChainSource: Send {
    fn origin(&self) -> &str;
    fn tip(&mut self) -> impl Future<Output = Result<BlockRef, SourceError>> + Send;
    fn block_hash(
        &mut self,
        height: u32,
    ) -> impl Future<Output = Result<[u8; 32], SourceError>> + Send;
    /// Compact blocks `from..=to` in height order, with every shielded pool asked for.
    fn blocks(
        &mut self,
        from: u32,
        to: u32,
    ) -> impl Future<Output = Result<Vec<CompactBlock>, SourceError>> + Send;
    /// The raw transaction, by its id in the byte order compact blocks use.
    fn transaction(
        &mut self,
        txid: &[u8; 32],
    ) -> impl Future<Output = Result<Vec<u8>, SourceError>> + Send;
}

/// A lightwalletd server over gRPC with TLS (webpki roots, `ring`). Connects on first use and
/// reconnects after a failure.
pub struct Lightwalletd {
    origin: String,
    client: Option<CompactTxStreamerClient<Channel>>,
}

impl Lightwalletd {
    pub fn new(origin: &str) -> Self {
        Self {
            origin: origin.to_owned(),
            client: None,
        }
    }

    async fn client(&mut self) -> Result<&mut CompactTxStreamerClient<Channel>, SourceError> {
        if self.client.is_none() {
            let channel = Channel::from_shared(self.origin.clone())
                .map_err(|_| SourceError::Unreachable)?
                .tls_config(ClientTlsConfig::new().with_webpki_roots())
                .map_err(|_| SourceError::Unreachable)?
                .connect_timeout(std::time::Duration::from_secs(10))
                .timeout(std::time::Duration::from_secs(30))
                .connect()
                .await
                .map_err(|_| SourceError::Unreachable)?;
            self.client = Some(CompactTxStreamerClient::new(channel));
        }
        self.client.as_mut().ok_or(SourceError::Unreachable)
    }

    /// Maps a gRPC status and drops the connection on transport trouble.
    fn fail(&mut self, status: &tonic::Status) -> SourceError {
        match status.code() {
            tonic::Code::NotFound | tonic::Code::OutOfRange => SourceError::NotFound,
            _ => {
                self.client = None;
                SourceError::Unreachable
            }
        }
    }
}

fn hash32(bytes: &[u8]) -> Result<[u8; 32], SourceError> {
    bytes.try_into().map_err(|_| SourceError::BadAnswer)
}

fn height32(h: u64) -> Result<u32, SourceError> {
    u32::try_from(h).map_err(|_| SourceError::BadAnswer)
}

impl ChainSource for Lightwalletd {
    fn origin(&self) -> &str {
        &self.origin
    }

    async fn tip(&mut self) -> Result<BlockRef, SourceError> {
        let answer = self.client().await?.get_latest_block(ChainSpec {}).await;
        match answer {
            Ok(r) => {
                let b = r.into_inner();
                Ok(BlockRef {
                    height: height32(b.height)?,
                    hash: hash32(&b.hash)?,
                })
            }
            Err(s) => Err(self.fail(&s)),
        }
    }

    async fn block_hash(&mut self, height: u32) -> Result<[u8; 32], SourceError> {
        let id = BlockId {
            height: height.into(),
            hash: vec![],
        };
        let answer = self.client().await?.get_block(id).await;
        match answer {
            Ok(r) => hash32(&r.into_inner().hash),
            Err(s) => Err(self.fail(&s)),
        }
    }

    async fn blocks(&mut self, from: u32, to: u32) -> Result<Vec<CompactBlock>, SourceError> {
        let range = BlockRange {
            start: Some(BlockId {
                height: from.into(),
                hash: vec![],
            }),
            end: Some(BlockId {
                height: to.into(),
                hash: vec![],
            }),
            // Ask for every shielded pool: older servers default to Sapling and Orchard only.
            pool_types: vec![
                PoolType::Sapling as i32,
                PoolType::Orchard as i32,
                PoolType::Ironwood as i32,
            ],
        };
        let answer = self.client().await?.get_block_range(range).await;
        let mut stream = match answer {
            Ok(r) => r.into_inner(),
            Err(s) => return Err(self.fail(&s)),
        };
        let mut out = Vec::new();
        loop {
            match stream.message().await {
                Ok(Some(block)) => out.push(block),
                Ok(None) => break,
                Err(s) => return Err(self.fail(&s)),
            }
        }
        Ok(out)
    }

    async fn transaction(&mut self, txid: &[u8; 32]) -> Result<Vec<u8>, SourceError> {
        let filter = TxFilter {
            block: None,
            index: 0,
            hash: txid.to_vec(),
        };
        let answer = self.client().await?.get_transaction(filter).await;
        match answer {
            Ok(r) => Ok(r.into_inner().data),
            Err(s) => Err(self.fail(&s)),
        }
    }
}
