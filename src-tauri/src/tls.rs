//! TLS for Riot's local APIs.
//!
//! The LCU and Live Client Data API serve self-signed certificates on 127.0.0.1. Instead of
//! globally disabling verification, the loopback client uses a verifier that skips the
//! chain check **only** when the server name is the IP `127.0.0.1`; any other host is
//! rejected outright. Handshake signatures are still verified against the presented cert.
//! Everything that leaves the machine (Data Dragon) uses a separate, normally-verified client.

use std::net::{IpAddr, Ipv4Addr};
use std::sync::Arc;
use std::time::Duration;

use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::crypto::CryptoProvider;
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{ClientConfig, DigitallySignedStruct, SignatureScheme};

pub const LOOPBACK: &str = "127.0.0.1";

#[derive(Debug)]
struct LoopbackOnlyVerifier {
    provider: Arc<CryptoProvider>,
}

impl ServerCertVerifier for LoopbackOnlyVerifier {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        if is_riot_loopback(server_name) {
            Ok(ServerCertVerified::assertion())
        } else {
            Err(rustls::Error::General(format!(
                "loopback TLS client refuses non-127.0.0.1 host {server_name:?}"
            )))
        }
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls12_signature(message, cert, dss, &self.provider.signature_verification_algorithms)
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls13_signature(message, cert, dss, &self.provider.signature_verification_algorithms)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.provider.signature_verification_algorithms.supported_schemes()
    }
}

fn is_riot_loopback(server_name: &ServerName<'_>) -> bool {
    matches!(server_name, ServerName::IpAddress(ip) if IpAddr::from(*ip) == IpAddr::V4(Ipv4Addr::LOCALHOST))
}

/// rustls config shared by the LCU HTTP client, the LCU WebSocket and the Live Client poller.
pub fn loopback_tls_config() -> Arc<ClientConfig> {
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let config = ClientConfig::builder_with_provider(provider.clone())
        .with_safe_default_protocol_versions()
        .expect("ring provider supports default TLS versions")
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(LoopbackOnlyVerifier { provider }))
        .with_no_client_auth();
    Arc::new(config)
}

/// HTTP client for `https://127.0.0.1:<port>` only. Proxies are bypassed so a system proxy
/// never sees LCU credentials.
pub fn loopback_http_client(timeout: Duration) -> reqwest::Client {
    reqwest::Client::builder()
        .use_preconfigured_tls((*loopback_tls_config()).clone())
        .no_proxy()
        .timeout(timeout)
        .build()
        .expect("loopback reqwest client")
}

pub fn loopback_url(port: u16, path: &str) -> String {
    format!("https://{LOOPBACK}:{port}{path}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn verify(name: &str) -> bool {
        let verifier = LoopbackOnlyVerifier { provider: Arc::new(rustls::crypto::ring::default_provider()) };
        let name = ServerName::try_from(name.to_string()).unwrap();
        verifier.verify_server_cert(&CertificateDer::from(vec![1, 2, 3]), &[], &name, &[], UnixTime::now()).is_ok()
    }

    #[test]
    fn accepts_only_ipv4_loopback() {
        assert!(verify("127.0.0.1"));
        assert!(!verify("127.0.0.2"));
        assert!(!verify("::1"));
        assert!(!verify("localhost"));
        assert!(!verify("ddragon.leagueoflegends.com"));
    }

    #[test]
    fn builds_loopback_urls() {
        assert_eq!(loopback_url(2999, "/liveclientdata/allgamedata"), "https://127.0.0.1:2999/liveclientdata/allgamedata");
    }
}
