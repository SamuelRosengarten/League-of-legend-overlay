// Assembles everything the matchup/threat views need from one MatchView.
import type { CuratedData } from "../data";
import type { MatchupEntry, MatchupFile, Tag, Text } from "../data/types";
import type { ChampionIndex } from "./champions";
import { type MatchView, type Role, SUPPORTED, supportedRole } from "./match";
import { type JunglePlan, planJungle } from "./pathPlanner";
import { type ProfileLookup, type ResolvedProfile, profileLookup } from "./profiles";
import { type RoleAssignment, inferRoles } from "./roles";
import { type ThreatRanking, rankThreats } from "./threat";
import { type TeamWarning, teamWarnings } from "./warnings";

export interface LaneOpponent {
  index: number;
  /** null while the opponent is hidden / not picked. */
  championId: string | null;
  assignment: RoleAssignment;
  entry: MatchupEntry | null;
  profile: ResolvedProfile | null;
  /** Generic advice for uncurated opponents, strongest-weighted tags first. */
  genericTips: (Text & { tag: Tag })[];
}

export type Advice =
  | { status: "no-champion" }
  | { status: "unsupported"; championId: string }
  | { status: "missing-data"; championId: string; role: Role }
  | {
      status: "ok";
      me: string;
      role: Role;
      data: MatchupFile;
      enemyRoles: RoleAssignment[];
      allyRoles: RoleAssignment[];
      laneOpponent: LaneOpponent | null;
      threats: ThreatRanking;
      warnings: TeamWarning[];
      /** Amumu only (null while the side is unknown or path data is missing). */
      plan: JunglePlan | null;
      profileOf: ProfileLookup;
    };

export function buildAdvice(match: MatchView, champs: ChampionIndex, data: CuratedData): Advice {
  const me = match.me;
  if (!me?.championId || me.hovering) return { status: "no-champion" };
  const role = supportedRole(me);
  if (!role) return { status: "unsupported", championId: me.championId };
  const file = data.matchups[me.championId];
  if (!file) return { status: "missing-data", championId: me.championId, role: SUPPORTED[me.championId]! };

  const profileOf = profileLookup(data.tags, champs);
  const plain = (id: string | null) => profileOf(id)?.profile ?? null;
  const enemyRoles = inferRoles(match.enemies, plain);
  const allyRoles = inferRoles(match.allies, plain);

  const enemies = match.enemies.map((e, i) => ({ championId: e.championId, role: enemyRoles[i]!.role, items: e.items.map((it) => it.id) }));
  const threats = rankThreats(enemies, { me: me.championId, myRole: role, matchups: file, items: data.items, profileOf });

  const laneIdx = enemyRoles.findIndex((r) => r.role === role);
  let laneOpponent: LaneOpponent | null = null;
  if (laneIdx >= 0) {
    const id = match.enemies[laneIdx]!.championId;
    const profile = profileOf(id);
    const entry = id ? (file.matchups[id] ?? null) : null;
    laneOpponent = {
      index: laneIdx,
      championId: id,
      assignment: enemyRoles[laneIdx]!,
      entry,
      profile,
      genericTips: entry || !profile ? [] : genericTips(file, [...profile.profile.traits]),
    };
  }

  const plan =
    role === "jungle" && match.side && data.paths
      ? planJungle({
          side: match.side,
          allies: match.allies.map((a, i) => ({ championId: a.championId, role: allyRoles[i]!.role })),
          enemies: enemies.map((e) => ({ championId: e.championId, role: e.role })),
          paths: data.paths,
          entryOf: (id) => file.matchups[id] ?? null,
          profileOf,
          name: (id) => champs.name(id),
        })
      : null;

  return {
    status: "ok",
    me: me.championId,
    role,
    data: file,
    enemyRoles,
    allyRoles,
    laneOpponent,
    threats,
    warnings: teamWarnings(me.championId, enemies, { profileOf, items: data.items, name: (id) => champs.name(id) }),
    plan,
    profileOf,
  };
}

function genericTips(file: MatchupFile, tags: Tag[]): (Text & { tag: Tag })[] {
  return tags
    .filter((t) => file.genericAdvice[t])
    .sort((a, b) => (file.threatWeights[b] ?? 0) - (file.threatWeights[a] ?? 0))
    .slice(0, 4)
    .map((tag) => ({ ...file.genericAdvice[tag]!, tag }));
}
