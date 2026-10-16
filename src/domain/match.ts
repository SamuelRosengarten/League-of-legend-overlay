// Normalizes champ-select sessions and Live Client data into one shape the views consume.
import type { ChampSelectPlayer, ChampSelectSession, LiveGame, LivePlayer } from "../types";
import type { ChampionIndex } from "./champions";

export type Role = "top" | "jungle" | "middle" | "bottom" | "utility";
export type Side = "blue" | "red";

export const SUPPORTED: Record<string, Role> = { Gwen: "top", Amumu: "jungle", Fiddlesticks: "utility" };
export const SMITE_SPELL_ID = 11;

export interface Slot {
  /** Data Dragon id; null while hidden / not picked. */
  championId: string | null;
  /** True if `championId` is only an ally's hover, not a lock. */
  hovering: boolean;
  /** From the API (champ-select `assignedPosition` / live `position`); null if unknown. */
  position: Role | null;
  /** null = unknown (enemy spells are not visible in champ select). */
  hasSmite: boolean | null;
  isMe: boolean;
  level: number | null;
  items: { id: number; name: string }[];
}

export interface MatchView {
  source: "champ-select" | "live";
  side: Side | null;
  me: Slot | null;
  allies: Slot[];
  enemies: Slot[];
  gameTime: number | null;
}

const ROLES: Role[] = ["top", "jungle", "middle", "bottom", "utility"];

export function toRole(position: string): Role | null {
  const p = position.toLowerCase();
  return (ROLES as string[]).includes(p) ? (p as Role) : null;
}

export function fromChampSelect(session: ChampSelectSession, champs: ChampionIndex): MatchView {
  // Enemy locks can show up in `actions` before `theirTeam` is updated.
  const lockedByCell = new Map<number, number>();
  for (const a of session.actions.flat()) {
    if (a.type === "pick" && a.completed && a.championId > 0) lockedByCell.set(a.actorCellId, a.championId);
  }
  const slot = (p: ChampSelectPlayer, ally: boolean): Slot => {
    const locked = p.championId || lockedByCell.get(p.cellId) || 0;
    const hover = ally && !locked && p.championPickIntent > 0;
    const spells = [p.spell1Id, p.spell2Id];
    return {
      championId: champs.idForKey(locked || (hover ? p.championPickIntent : 0)),
      hovering: hover,
      position: toRole(p.assignedPosition),
      hasSmite: ally || spells.some((s) => s > 0) ? spells.includes(SMITE_SPELL_ID) : null,
      isMe: ally && p.cellId === session.localPlayerCellId,
      level: null,
      items: [],
    };
  };
  const allies = session.myTeam.map((p) => slot(p, true));
  const meRaw = session.myTeam.find((p) => p.cellId === session.localPlayerCellId);
  return {
    source: "champ-select",
    side: meRaw ? (meRaw.team === 2 ? "red" : "blue") : null,
    me: allies.find((s) => s.isMe) ?? null,
    allies,
    enemies: session.theirTeam.map((p) => slot(p, false)),
    gameTime: null,
  };
}

function isLocalPlayer(p: LivePlayer, game: LiveGame): boolean {
  const a = game.activePlayer;
  return (!!a.riotId && p.riotId === a.riotId) || (!!a.summonerName && p.summonerName === a.summonerName);
}

export function fromLive(game: LiveGame, champs: ChampionIndex): MatchView | null {
  const meRaw = game.allPlayers.find((p) => isLocalPlayer(p, game));
  if (!meRaw) return null; // spectator / replay
  const slot = (p: LivePlayer): Slot => {
    const spells = [p.summonerSpells.summonerSpellOne, p.summonerSpells.summonerSpellTwo];
    return {
      championId: champs.idForLive(p.rawChampionName, p.championName),
      hovering: false,
      position: toRole(p.position),
      hasSmite: spells.some((s) => /smite/i.test(s.displayName) || /SummonerSmite/i.test(s.rawDisplayName)),
      isMe: p === meRaw,
      level: p.level,
      items: p.items.map((i) => ({ id: i.itemID, name: i.displayName })),
    };
  };
  const allies = game.allPlayers.filter((p) => p.team === meRaw.team).map(slot);
  return {
    source: "live",
    side: meRaw.team === "CHAOS" ? "red" : "blue",
    me: allies.find((s) => s.isMe) ?? null,
    allies,
    enemies: game.allPlayers.filter((p) => p.team !== meRaw.team).map(slot),
    gameTime: game.gameData.gameTime,
  };
}

export function supportedRole(me: Slot | null): Role | null {
  if (!me?.championId || me.hovering) return null;
  return SUPPORTED[me.championId] ?? null;
}

export function formatGameTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
