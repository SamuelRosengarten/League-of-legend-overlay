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
  /** Stuck to the side of the League client window (idle mode, client open). */
  docked: boolean;
  /** Docked on the client's left side: companions go on the panel's left border. */
  dockedLeft: boolean;
  hotkeys: { toggleVisibility: string; toggleInteractive: string };
}

/** One of the player's own games (src-tauri/src/history.rs). */
export interface RecentGame {
  gameId: number;
  /** LCU numeric champion key. */
  championId: number;
  queueId: number;
  gameMode: string;
  gameType: string;
  /** Unix ms. */
  created: number;
  durationSecs: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  damageToChampions: number;
  gold: number;
}

export interface History {
  /** Newest first. */
  games: RecentGame[];
  mastery: { championId: number; level: number; points: number }[];
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
  fiddlesticks: boolean;
  /** Occasional little scenes between the companions (chase, snipping, scare). */
  scenes: boolean;
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
  /** Overlay zoom, SCALE_MIN – SCALE_MAX (src/theme/appearance.ts). */
  scale: number;
  /** In game, snap the panel to the nearest left/right edge after a drag. */
  snapToEdge: boolean;
  /** Outside champ select and games, stick to the side of the League client window. */
  dockToClient: boolean;
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
  history: History | null;
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
