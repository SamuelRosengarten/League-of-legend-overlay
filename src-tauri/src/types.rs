//! Typed subsets of the official LCU and Live Client Data API payloads.
//!
//! Every field we do not need is ignored; every field we do need is `#[serde(default)]`
//! so partial / older payloads still deserialize. The same structs are serialized to the
//! frontend (mirrored by hand in `src/types.ts` — keep both in sync).

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// LCU: /lol-champ-select/v1/session
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChampSelectSession {
    pub local_player_cell_id: i64,
    pub my_team: Vec<ChampSelectPlayer>,
    pub their_team: Vec<ChampSelectPlayer>,
    pub actions: Vec<Vec<ChampSelectAction>>,
    pub timer: ChampSelectTimer,
    pub is_spectating: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChampSelectPlayer {
    pub cell_id: i64,
    /// Data Dragon numeric `key` (0 = not picked / hidden).
    pub champion_id: i64,
    /// Hover intent (only visible for allies).
    pub champion_pick_intent: i64,
    /// "top" | "jungle" | "middle" | "bottom" | "utility" | "" (blind pick / enemies).
    pub assigned_position: String,
    pub spell1_id: i64,
    pub spell2_id: i64,
    /// 1 = blue (ORDER), 2 = red (CHAOS).
    pub team: i64,
    pub game_name: String,
    pub tag_line: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChampSelectAction {
    pub actor_cell_id: i64,
    pub champion_id: i64,
    pub completed: bool,
    pub is_ally_action: bool,
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChampSelectTimer {
    pub phase: String,
}

// ---------------------------------------------------------------------------
// Live Client Data API: /liveclientdata/allgamedata
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LiveGame {
    pub active_player: LiveActivePlayer,
    pub all_players: Vec<LivePlayer>,
    pub game_data: LiveGameData,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LiveActivePlayer {
    pub riot_id: String,
    pub summoner_name: String,
    pub level: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LivePlayer {
    pub champion_name: String,
    /// e.g. "game_character_displayname_MonkeyKing" — suffix is the Data Dragon id.
    pub raw_champion_name: String,
    pub riot_id: String,
    pub summoner_name: String,
    /// "ORDER" (blue) | "CHAOS" (red).
    pub team: String,
    /// "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY" | "".
    pub position: String,
    pub level: i64,
    pub is_bot: bool,
    pub is_dead: bool,
    pub items: Vec<LiveItem>,
    pub summoner_spells: LiveSummonerSpells,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct LiveItem {
    #[serde(rename = "itemID")]
    pub item_id: i64,
    #[serde(rename = "displayName")]
    pub display_name: String,
    pub slot: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LiveSummonerSpells {
    pub summoner_spell_one: LiveSpell,
    pub summoner_spell_two: LiveSpell,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LiveSpell {
    pub display_name: String,
    pub raw_display_name: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LiveGameData {
    pub game_mode: String,
    pub game_time: f64,
    pub map_number: i64,
}

// ---------------------------------------------------------------------------
// App-level status payloads
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "kebab-case")]
pub enum ConnectionStatus {
    /// No lockfile and no LeagueClientUx.exe process found.
    ClientNotRunning,
    /// Credentials found, trying to reach the API.
    Connecting,
    Connected { port: u16, transport: Transport },
    /// Credentials found but the API refused / timed out.
    ApiUnreachable { message: String },
    /// Fixture replay, real APIs are not touched.
    Mock,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Transport {
    Websocket,
    Polling,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "kebab-case")]
pub enum LiveStatus {
    /// Not in a game phase — not polling.
    Idle,
    /// In game phase but the API is not up yet (loading screen).
    Waiting,
    Connected,
    Unreachable { message: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn live_item_keeps_api_field_names() {
        let item: LiveItem =
            serde_json::from_str(r#"{"itemID":3074,"displayName":"Ravenous Hydra","slot":0,"price":1200}"#).unwrap();
        assert_eq!(item.item_id, 3074);
        let back = serde_json::to_value(&item).unwrap();
        assert_eq!(back["itemID"], 3074);
    }

    #[test]
    fn champ_select_tolerates_missing_fields() {
        let s: ChampSelectSession = serde_json::from_str(r#"{"myTeam":[{"cellId":2,"championId":887}]}"#).unwrap();
        assert_eq!(s.my_team[0].champion_id, 887);
        assert!(s.their_team.is_empty());
    }
}
