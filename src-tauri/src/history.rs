//! The player's own recent games and champion mastery, for the client-docked stats panel.
//!
//! Source: `/lol-match-history/v1/products/lol/current-summoner/matches` (only the local
//! player's participant) and `/lol-champion-mastery/v1/local-player/champion-mastery`. The
//! client only serves the 20 most recent games and ignores begIndex/endIndex beyond that
//! (checked against a live client, Oct 2026), so there is no paging.
//! Only the fields the panel needs are kept; aggregation happens in the frontend
//! (`src/domain/stats.ts`), where it is unit-tested next to the views.

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const MATCHES_PATH: &str = "/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=19";
pub const MASTERY_PATH: &str = "/lol-champion-mastery/v1/local-player/champion-mastery";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentGame {
    pub game_id: i64,
    pub champion_id: i64,
    pub queue_id: i64,
    /// "CLASSIC", "ARAM", "PRACTICETOOL", ...
    pub game_mode: String,
    /// "MATCHED_GAME" or "CUSTOM_GAME".
    pub game_type: String,
    /// Unix ms.
    pub created: i64,
    pub duration_secs: i64,
    pub win: bool,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    /// Lane minions + jungle monsters.
    pub cs: i64,
    pub damage_to_champions: i64,
    pub gold: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mastery {
    pub champion_id: i64,
    pub level: i64,
    pub points: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct History {
    /// Newest first.
    pub games: Vec<RecentGame>,
    pub mastery: Vec<Mastery>,
}

/// Newest first; entries with an unexpected shape are skipped.
pub fn parse_matches(v: &Value) -> Vec<RecentGame> {
    let Some(games) = v.pointer("/games/games").and_then(Value::as_array) else { return Vec::new() };
    let mut games: Vec<RecentGame> = games.iter().filter_map(parse_game).collect();
    games.sort_by_key(|g| std::cmp::Reverse(g.created));
    games
}

fn parse_game(g: &Value) -> Option<RecentGame> {
    let p = g.get("participants")?.as_array()?.first()?;
    let s = p.get("stats")?;
    let int = |v: &Value, k: &str| v.get(k).and_then(Value::as_i64).unwrap_or(0);
    let text = |k: &str| g.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
    Some(RecentGame {
        game_id: g.get("gameId")?.as_i64()?,
        champion_id: p.get("championId")?.as_i64()?,
        queue_id: int(g, "queueId"),
        game_mode: text("gameMode"),
        game_type: text("gameType"),
        created: int(g, "gameCreation"),
        duration_secs: int(g, "gameDuration"),
        win: s.get("win").and_then(Value::as_bool).unwrap_or(false),
        kills: int(s, "kills"),
        deaths: int(s, "deaths"),
        assists: int(s, "assists"),
        cs: int(s, "totalMinionsKilled") + int(s, "neutralMinionsKilled"),
        damage_to_champions: int(s, "totalDamageDealtToChampions"),
        gold: int(s, "goldEarned"),
    })
}

pub fn parse_mastery(v: &Value) -> Vec<Mastery> {
    let Some(list) = v.as_array() else { return Vec::new() };
    list.iter()
        .filter_map(|m| {
            Some(Mastery {
                champion_id: m.get("championId")?.as_i64()?,
                level: m.get("championLevel").and_then(Value::as_i64).unwrap_or(0),
                points: m.get("championPoints").and_then(Value::as_i64).unwrap_or(0),
            })
        })
        .collect()
}

/// Mock-mode history: a believable mix of Gwen, Amumu, other champions, a Practice Tool
/// session and a remake, newest first, ending `now`.
pub fn sample(now: i64) -> History {
    const HOUR: i64 = 3_600_000;
    // (champion, queue, mode, type, hours ago, minutes, win, k, d, a, cs, damage, gold)
    type Row = (i64, i64, &'static str, &'static str, i64, i64, bool, i64, i64, i64, i64, i64, i64);
    #[rustfmt::skip]
    let rows: [Row; 14] = [
        (887, 420, "CLASSIC", "MATCHED_GAME", 0, 31, true, 9, 4, 6, 241, 28_400, 13_900),
        (887, 3140, "PRACTICETOOL", "CUSTOM_GAME", 1, 12, false, 0, 0, 0, 40, 0, 2_100),
        (887, 420, "CLASSIC", "MATCHED_GAME", 2, 27, false, 4, 7, 3, 188, 17_200, 10_100),
        (32, 420, "CLASSIC", "MATCHED_GAME", 3, 29, true, 3, 5, 17, 172, 19_800, 11_200),
        (887, 420, "CLASSIC", "MATCHED_GAME", 20, 3, false, 0, 1, 0, 9, 600, 900),
        (887, 400, "CLASSIC", "MATCHED_GAME", 22, 34, true, 11, 5, 4, 262, 31_000, 15_300),
        (32, 400, "CLASSIC", "MATCHED_GAME", 26, 25, false, 2, 8, 9, 151, 14_100, 8_900),
        (517, 450, "ARAM", "MATCHED_GAME", 27, 17, true, 12, 9, 31, 44, 38_000, 14_200),
        (887, 420, "CLASSIC", "MATCHED_GAME", 46, 30, true, 7, 3, 8, 228, 25_100, 12_800),
        (32, 420, "CLASSIC", "MATCHED_GAME", 48, 33, true, 5, 4, 21, 190, 22_400, 12_300),
        (887, 420, "CLASSIC", "MATCHED_GAME", 50, 24, false, 3, 6, 2, 161, 15_900, 8_800),
        (432, 480, "SWIFTPLAY", "MATCHED_GAME", 70, 22, true, 1, 3, 19, 30, 9_800, 8_100),
        (887, 480, "SWIFTPLAY", "MATCHED_GAME", 72, 21, true, 8, 2, 5, 175, 21_300, 11_000),
        (32, 400, "CLASSIC", "MATCHED_GAME", 95, 28, false, 1, 6, 11, 160, 13_200, 9_400),
    ];
    let games = rows
        .iter()
        .enumerate()
        .map(|(i, &(champion_id, queue_id, mode, kind, hours, minutes, win, kills, deaths, assists, cs, damage, gold))| {
            RecentGame {
                game_id: 1_000 + i as i64,
                champion_id,
                queue_id,
                game_mode: mode.into(),
                game_type: kind.into(),
                created: now - hours * HOUR - minutes * 60_000,
                duration_secs: minutes * 60,
                win,
                kills,
                deaths,
                assists,
                cs,
                damage_to_champions: damage,
                gold,
            }
        })
        .collect();
    History {
        games,
        mastery: vec![
            Mastery { champion_id: 887, level: 7, points: 61_420 },
            Mastery { champion_id: 32, level: 4, points: 18_950 },
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn game(id: i64, created: i64) -> Value {
        json!({
            "gameId": id, "gameCreation": created, "gameDuration": 1102, "queueId": 400,
            "gameMode": "CLASSIC", "gameType": "MATCHED_GAME",
            "participants": [{
                "championId": 887,
                "stats": {
                    "win": true, "kills": 7, "deaths": 2, "assists": 5,
                    "totalMinionsKilled": 180, "neutralMinionsKilled": 12,
                    "totalDamageDealtToChampions": 21000, "goldEarned": 11500
                }
            }]
        })
    }

    #[test]
    fn parses_the_local_player_line() {
        let page = json!({ "games": { "games": [game(1, 100), { "gameId": 2 }] } });
        let games = parse_matches(&page);
        assert_eq!(games.len(), 1, "malformed entries are skipped");
        let g = &games[0];
        assert_eq!((g.champion_id, g.kills, g.deaths, g.assists, g.cs), (887, 7, 2, 5, 192));
        assert!(g.win);
        assert_eq!(g.game_mode, "CLASSIC");
        assert!(parse_matches(&json!({ "errorCode": "RPC_ERROR" })).is_empty());
    }

    #[test]
    fn sorts_newest_first() {
        let games = parse_matches(&json!({ "games": { "games": [game(1, 100), game(3, 300), game(2, 200)] } }));
        let ids: Vec<i64> = games.iter().map(|g| g.game_id).collect();
        assert_eq!(ids, [3, 2, 1]);
    }

    #[test]
    fn parses_mastery() {
        let m = parse_mastery(&json!([{ "championId": 887, "championLevel": 3, "championPoints": 6107 }, { "bad": 1 }]));
        assert_eq!(m, [Mastery { champion_id: 887, level: 3, points: 6107 }]);
    }
}
