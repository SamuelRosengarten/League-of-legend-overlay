//! LCU credential discovery.
//!
//! Order: explicit override dir → default install dir → directory of the running
//! `LeagueClientUx.exe` / `LeagueClient.exe` → `--app-port` / `--remoting-auth-token`
//! from the `LeagueClientUx.exe` command line. Only process *metadata* (path, args)
//! is read — never process memory.

use std::path::{Path, PathBuf};

pub const DEFAULT_INSTALL_DIR: &str = r"C:\Riot Games\League of Legends";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Lockfile {
    pub process: String,
    pub pid: u32,
    pub port: u16,
    pub password: String,
    pub protocol: String,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum LockfileError {
    #[error("lockfile must have 5 ':'-separated fields, got {0}")]
    FieldCount(usize),
    #[error("invalid {0} in lockfile")]
    InvalidField(&'static str),
}

/// Parses `LeagueClient:<pid>:<port>:<password>:<protocol>`.
pub fn parse(contents: &str) -> Result<Lockfile, LockfileError> {
    let parts: Vec<&str> = contents.trim().split(':').collect();
    if parts.len() != 5 {
        return Err(LockfileError::FieldCount(parts.len()));
    }
    let pid = parts[1].parse().map_err(|_| LockfileError::InvalidField("pid"))?;
    let port: u16 = parts[2].parse().map_err(|_| LockfileError::InvalidField("port"))?;
    if port == 0 {
        return Err(LockfileError::InvalidField("port"));
    }
    if parts[3].is_empty() {
        return Err(LockfileError::InvalidField("password"));
    }
    Ok(Lockfile {
        process: parts[0].to_string(),
        pid,
        port,
        password: parts[3].to_string(),
        protocol: parts[4].to_string(),
    })
}

/// Extracts credentials from `LeagueClientUx.exe` arguments
/// (`--app-port=1234 --remoting-auth-token=abc`).
pub fn from_command_line<S: AsRef<str>>(args: &[S]) -> Option<Lockfile> {
    let arg = |name: &str| {
        args.iter().find_map(|a| a.as_ref().strip_prefix(name).map(|v| v.trim_matches('"').to_string()))
    };
    let port = arg("--app-port=")?.parse().ok().filter(|p| *p != 0)?;
    let password = arg("--remoting-auth-token=").filter(|p| !p.is_empty())?;
    Some(Lockfile { process: "LeagueClientUx".into(), pid: 0, port, password, protocol: "https".into() })
}

/// `--install-directory=...` from the `LeagueClientUx.exe` arguments.
pub fn install_dir_from_command_line<S: AsRef<str>>(args: &[S]) -> Option<PathBuf> {
    args.iter()
        .find_map(|a| a.as_ref().strip_prefix("--install-directory="))
        .map(|v| PathBuf::from(v.trim_matches('"')))
}

fn read_in(dir: &Path) -> Option<Lockfile> {
    let contents = std::fs::read_to_string(dir.join("lockfile")).ok()?;
    match parse(&contents) {
        Ok(l) => Some(l),
        Err(e) => {
            log::warn!("ignoring lockfile in {}: {e}", dir.display());
            None
        }
    }
}

/// Finds the current LCU credentials, or `None` if the client is not running.
pub fn discover(override_dir: Option<&Path>) -> Option<Lockfile> {
    if let Some(found) = override_dir.and_then(read_in) {
        return Some(found);
    }
    if let Some(found) = read_in(Path::new(DEFAULT_INSTALL_DIR)) {
        return Some(found);
    }
    discover_from_process()
}

fn discover_from_process() -> Option<Lockfile> {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_exe(UpdateKind::Always).with_cmd(UpdateKind::Always),
    );
    let mut cmdline_fallback = None;
    for name in ["LeagueClientUx.exe", "LeagueClient.exe"] {
        for process in sys.processes_by_exact_name(name.as_ref()) {
            let args: Vec<String> = process.cmd().iter().map(|a| a.to_string_lossy().into_owned()).collect();
            let dirs = [
                install_dir_from_command_line(&args),
                process.exe().and_then(Path::parent).map(Path::to_path_buf),
            ];
            if let Some(found) = dirs.iter().flatten().find_map(|d| read_in(d)) {
                return Some(found);
            }
            if cmdline_fallback.is_none() {
                cmdline_fallback = from_command_line(&args);
            }
        }
    }
    cmdline_fallback
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_lockfile() {
        let l = parse("LeagueClient:21360:58349:Zx9-abc_DEF:https\n").unwrap();
        assert_eq!(
            l,
            Lockfile {
                process: "LeagueClient".into(),
                pid: 21360,
                port: 58349,
                password: "Zx9-abc_DEF".into(),
                protocol: "https".into()
            }
        );
    }

    #[test]
    fn rejects_malformed_lockfiles() {
        assert_eq!(parse(""), Err(LockfileError::FieldCount(1)));
        assert_eq!(parse("LeagueClient:1:2:3"), Err(LockfileError::FieldCount(4)));
        assert_eq!(parse("LeagueClient:x:58349:pw:https"), Err(LockfileError::InvalidField("pid")));
        assert_eq!(parse("LeagueClient:1:99999:pw:https"), Err(LockfileError::InvalidField("port")));
        assert_eq!(parse("LeagueClient:1:0:pw:https"), Err(LockfileError::InvalidField("port")));
        assert_eq!(parse("LeagueClient:1:58349::https"), Err(LockfileError::InvalidField("password")));
    }

    #[test]
    fn reads_credentials_from_command_line() {
        let args = [
            "C:/Riot Games/League of Legends/LeagueClientUx.exe",
            "--riotclient-auth-token=nope",
            "--app-port=60123",
            "--remoting-auth-token=s3cr3t",
            "--install-directory=C:/Games/LoL",
        ];
        let l = from_command_line(&args).unwrap();
        assert_eq!((l.port, l.password.as_str()), (60123, "s3cr3t"));
        assert_eq!(install_dir_from_command_line(&args), Some(PathBuf::from("C:/Games/LoL")));
        assert_eq!(from_command_line(&["--app-port=60123"]), None);
    }

    #[test]
    fn reads_lockfile_from_override_dir() {
        let dir = std::env::temp_dir().join(format!("rift-lockfile-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("lockfile"), "LeagueClient:1:4242:pw:https").unwrap();
        assert_eq!(discover(Some(&dir)).map(|l| l.port), Some(4242));
        std::fs::remove_dir_all(&dir).ok();
    }
}
