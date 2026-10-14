//! Current ranked tier from the LCU (`/lol-ranked/v1/current-ranked-stats`), used for the
//! overlay's rank theme. Solo/Duo first, then Flex; an account without a tier this season
//! is reported as "unranked" (never guessed). The last client-reported rank is kept in
//! settings so the theme survives the client being closed.

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const RANKED_PATH: &str = "/lol-ranked/v1/current-ranked-stats";
pub const RANKED_EVENT: &str = "OnJsonApiEvent_lol-ranked_v1_current-ranked-stats";

pub const TIERS: [&str; 10] =
    ["iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond", "master", "grandmaster", "challenger"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RankInfo {
    /// One of `TIERS`, or "unranked".
    pub tier: String,
    /// "I".."IV"; None for Master+ and unranked.
    pub division: Option<String>,
    pub league_points: i64,
    pub wins: i64,
    pub losses: i64,
    /// "solo" | "flex".
    pub queue: String,
    /// Placement games left this season (unranked accounts).
    pub provisional_games_remaining: i64,
    /// "client" (live from the LCU), "cached" (last client value, client not connected) or "mock".
    pub source: String,
}

fn queue_rank(entry: &Value, queue: &str, source: &str) -> Option<RankInfo> {
    let tier = entry.get("tier")?.as_str()?.to_ascii_lowercase();
    if !TIERS.contains(&tier.as_str()) {
        return None;
    }
    let division = entry
        .get("division")
        .and_then(Value::as_str)
        .filter(|d| matches!(*d, "I" | "II" | "III" | "IV"))
        .filter(|_| !matches!(tier.as_str(), "master" | "grandmaster" | "challenger"))
        .map(str::to_owned);
    let int = |k: &str| entry.get(k).and_then(Value::as_i64).unwrap_or(0);
    Some(RankInfo {
        tier,
        division,
        league_points: int("leaguePoints"),
        wins: int("wins"),
        losses: int("losses"),
        queue: queue.into(),
        provisional_games_remaining: int("provisionalGamesRemaining"),
        source: source.into(),
    })
}

/// Parses the LCU ranked-stats payload. Returns `None` only if the payload is unusable.
pub fn from_ranked_stats(v: &Value) -> Option<RankInfo> {
    let map = v.get("queueMap")?;
    let solo = map.get("RANKED_SOLO_5x5");
    let flex = map.get("RANKED_FLEX_SR");
    if let Some(r) = solo.and_then(|e| queue_rank(e, "solo", "client")).or_else(|| flex.and_then(|e| queue_rank(e, "flex", "client"))) {
        return Some(r);
    }
    let remaining = solo.and_then(|e| e.get("provisionalGamesRemaining")).and_then(Value::as_i64).unwrap_or(0);
    Some(RankInfo {
        tier: "unranked".into(),
        division: None,
        league_points: 0,
        wins: 0,
        losses: 0,
        queue: "solo".into(),
        provisional_games_remaining: remaining,
        source: "client".into(),
    })
}

/// Mock rank from `RIFT_MOCK_RANK`, e.g. "gold II 47" or "challenger 1203" (default: emerald II).
pub fn mock_rank(spec: Option<&str>) -> RankInfo {
    let spec = spec.unwrap_or("emerald II 63").to_ascii_lowercase();
    let mut parts = spec.split_whitespace();
    let tier = parts.next().filter(|t| TIERS.contains(t) || *t == "unranked").unwrap_or("emerald").to_string();
    let mut division = None;
    let mut lp = 0;
    for p in parts {
        match p {
            "i" | "ii" | "iii" | "iv" => division = Some(p.to_ascii_uppercase()),
            n => lp = n.parse().unwrap_or(0),
        }
    }
    if matches!(tier.as_str(), "master" | "grandmaster" | "challenger" | "unranked") {
        division = None;
    } else if division.is_none() {
        division = Some("II".into());
    }
    RankInfo { tier, division, league_points: lp, wins: 48, losses: 41, queue: "solo".into(), provisional_games_remaining: 0, source: "mock".into() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn prefers_solo_then_flex() {
        let v = json!({"queueMap": {
            "RANKED_SOLO_5x5": {"tier": "GOLD", "division": "II", "leaguePoints": 47, "wins": 10, "losses": 8},
            "RANKED_FLEX_SR": {"tier": "SILVER", "division": "I"}
        }});
        let r = from_ranked_stats(&v).unwrap();
        assert_eq!((r.tier.as_str(), r.division.as_deref(), r.league_points, r.queue.as_str()), ("gold", Some("II"), 47, "solo"));

        let v = json!({"queueMap": {"RANKED_SOLO_5x5": {"tier": "", "division": "NA"}, "RANKED_FLEX_SR": {"tier": "MASTER", "division": "I", "leaguePoints": 120}}});
        let r = from_ranked_stats(&v).unwrap();
        assert_eq!((r.tier.as_str(), r.division, r.queue.as_str()), ("master", None, "flex"));
    }

    #[test]
    fn unranked_accounts_are_reported_as_unranked() {
        // Shape observed from a live client with placements pending.
        let v = json!({"queueMap": {"RANKED_SOLO_5x5": {"tier": "", "division": "NA", "isProvisional": true, "provisionalGamesRemaining": 5}}});
        let r = from_ranked_stats(&v).unwrap();
        assert_eq!((r.tier.as_str(), r.provisional_games_remaining), ("unranked", 5));
        assert!(from_ranked_stats(&json!({"oops": 1})).is_none());
    }

    #[test]
    fn parses_mock_rank_specs() {
        assert_eq!(mock_rank(Some("gold IV 12")).division.as_deref(), Some("IV"));
        assert_eq!(mock_rank(Some("Challenger 1203")).league_points, 1203);
        assert_eq!(mock_rank(Some("challenger")).division, None);
        assert_eq!(mock_rank(Some("nonsense")).tier, "emerald");
    }
}
