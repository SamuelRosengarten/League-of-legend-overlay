// Mirrors of the Rust payloads in src-tauri/src/{types,state,overlay,mock,ddragon}.rs.
// Keep in sync by hand — field names are the serialized (camelCase) forms.

export interface ChampSelectPlayer {
  cellId: number;
  championId: number;
  championPickIntent: number;
  assignedPosition: string;
  spell1Id: number;
  spell2Id: number;
  team: number;
  gameName: string;
  tagLine: string;
}

export interface ChampSelectAction {
  actorCellId: number;
  championId: number;
  completed: boolean;
  isAllyAction: boolean;
  type: string;
}

export interface ChampSelectSession {
  localPlayerCellId: number;
  myTeam: ChampSelectPlayer[];
  theirTeam: ChampSelectPlayer[];
  actions: ChampSelectAction[][];
  timer: { phase: string };
  isSpectating: boolean;
}

export interface LiveItem {
  itemID: number;
  displayName: string;
  slot: number;
}

export interface LiveSpell {
  displayName: string;
  rawDisplayName: string;
}

export interface LivePlayer {
  championName: string;
  rawChampionName: string;
  riotId: string;
  summonerName: string;
  team: "ORDER" | "CHAOS" | string;
  position: string;
  level: number;
  isBot: boolean;
  isDead: boolean;
  items: LiveItem[];
  summonerSpells: { summonerSpellOne: LiveSpell; summonerSpellTwo: LiveSpell };
}

export interface LiveGame {
  activePlayer: { riotId: string; summonerName: string; level: number };
  allPlayers: LivePlayer[];
  gameData: { gameMode: string; gameTime: number; mapNumber: number };
}

export type ConnectionStatus =
  | { state: "client-not-running" }
  | { state: "connecting" }
  | { state: "connected"; port: number; transport: "websocket" | "polling" }
  | { state: "api-unreachable"; message: string }
  | { state: "mock" };

export type LiveStatus =
  | { state: "idle" }
  | { state: "waiting" }
  | { state: "connected" }
  | { state: "unreachable"; message: string };

export interface LivePayload {
  status: LiveStatus;
  game: LiveGame | null;
}

export type OverlayMode = "idle" | "champ-select" | "in-game" | "hidden";

export interface OverlayState {
  mode: OverlayMode;
  visible: boolean;
  interactive: boolean;
  dock: "left" | "right";
  hotkeys: { toggleVisibility: string; toggleInteractive: string };
}

export interface RankInfo {
  /** "iron" … "challenger" or "unranked". */
  tier: string;
  division: string | null;
  leaguePoints: number;
  wins: number;
  losses: number;
  queue: "solo" | "flex";
  provisionalGamesRemaining: number;
  /** "client" = live, "cached" = last client value (client closed), "mock". */
  source: "client" | "cached" | "mock";
}

export interface CompanionSettings {
  gwen: boolean;
  amumu: boolean;
  placement: string;
  size: number;
  inGame: boolean;
}

/** Persisted in settings.json (Rust); option lists live in src/theme/ and src/ui/companions/. */
export interface Appearance {
  /** "auto" or a tier id. */
  theme: string;
  motion: string;
  companions: CompanionSettings;
}

export interface Snapshot {
  mock: boolean;
  connection: ConnectionStatus;
  phase: string;
  champSelect: ChampSelectSession | null;
  live: LivePayload;
  overlay: OverlayState;
  rank: RankInfo | null;
  appearance: Appearance;
}

export interface MockStatus {
  scenarios: { id: string; name: string; description: string }[];
  scenario: string | null;
  stepIndex: number;
  stepCount: number;
  stepLabel: string;
  playing: boolean;
  error: string | null;
}

export interface DdChampion {
  id: string;
  key: number;
  name: string;
  tags: string[];
}

export interface DdragonData {
  version: string;
  champions: DdChampion[];
  offline: boolean;
}
