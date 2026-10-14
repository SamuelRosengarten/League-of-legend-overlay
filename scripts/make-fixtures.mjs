// Regenerates fixtures/scenarios/*.json (LCU champ-select sessions + Live Client allgamedata
// payloads shaped like the real APIs). Run: node scripts/make-fixtures.mjs
// Edit the JSON directly for one-off tweaks; this script exists so scenarios stay consistent.
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = new URL("../fixtures/scenarios/", import.meta.url);

// Data Dragon id → [numeric key, display name]
const C = {
  Gwen: [887, "Gwen"], Fiora: [114, "Fiora"], Amumu: [32, "Amumu"], LeeSin: [64, "Lee Sin"],
  Yasuo: [157, "Yasuo"], Darius: [122, "Darius"], Jinx: [222, "Jinx"], Thresh: [412, "Thresh"],
  Lux: [99, "Lux"], Ezreal: [81, "Ezreal"], Vi: [254, "Vi"], Viego: [234, "Viego"],
  Kaisa: [145, "Kai'Sa"], Nautilus: [111, "Nautilus"], Morgana: [25, "Morgana"], Ahri: [103, "Ahri"],
  Orianna: [61, "Orianna"], Renekton: [58, "Renekton"], Syndra: [134, "Syndra"], Teemo: [17, "Teemo"],
  Graves: [104, "Graves"], Caitlyn: [51, "Caitlyn"], Leona: [89, "Leona"], Sejuani: [113, "Sejuani"],
  Malphite: [54, "Malphite"], Senna: [235, "Senna"], Zed: [238, "Zed"], Ashe: [22, "Ashe"],
};
const SPELL = { Flash: 4, Teleport: 12, Ignite: 14, Smite: 11, Heal: 7, Exhaust: 3, Barrier: 21, Ghost: 6, Cleanse: 1 };
const ITEM = {
  DoransBlade: [1055, "Doran's Blade"], DoransRing: [1056, "Doran's Ring"], DoransShield: [1054, "Doran's Shield"],
  HealthPot: [2003, "Health Potion"], Tiamat: [3077, "Tiamat"], RavenousHydra: [3074, "Ravenous Hydra"],
  Steelcaps: [3047, "Plated Steelcaps"], Mercs: [3111, "Mercury's Treads"], LongSword: [1036, "Long Sword"],
  Qss: [3140, "Quicksilver Sash"], Executioners: [3123, "Executioner's Calling"], Bramble: [3076, "Bramble Vest"],
  Nashors: [3115, "Nashor's Tooth"], Riftmaker: [4633, "Riftmaker"], Sheen: [3057, "Sheen"],
  Gustwalker: [1102, "Gustwalker Hatchling"], Mosstomper: [1103, "Mosstomper Seedling"], Scorchclaw: [1101, "Scorchclaw Pup"],
  Sunfire: [3068, "Sunfire Aegis"], BamisCinder: [6660, "Bami's Cinder"], Boots: [1001, "Boots"],
  OblivionOrb: [3916, "Oblivion Orb"], Kraken: [6672, "Kraken Slayer"], Noonquiver: [6670, "Noonquiver"],
  WorldAtlas: [3865, "World Atlas"], Cull: [1083, "Cull"], Eclipse: [6692, "Eclipse"],
  Ludens: [6655, "Luden's Companion"], Ward: [3340, "Stealth Ward"], Mercurial: [3139, "Mercurial Scimitar"],
};

const ME = { gameName: "Sam", tagLine: "EUW" };

function csPlayer(cellId, champ, position, spells, team, { intent = null, name = `Player${cellId}` } = {}) {
  return {
    cellId,
    championId: champ ? C[champ][0] : 0,
    championPickIntent: intent ? C[intent][0] : 0,
    assignedPosition: position,
    spell1Id: spells ? SPELL[spells[0]] : 0,
    spell2Id: spells ? SPELL[spells[1]] : 0,
    team,
    gameName: name,
    tagLine: name === ME.gameName ? ME.tagLine : "",
    summonerId: 1000 + cellId,
  };
}

function session(localPlayerCellId, myTeam, theirTeam, timerPhase) {
  return { localPlayerCellId, myTeam, theirTeam, actions: [], timer: { phase: timerPhase }, isSpectating: false };
}

function livePlayer(champ, team, position, level, items, spells, name) {
  const [, display] = C[champ];
  return {
    championName: display,
    rawChampionName: `game_character_displayname_${champ}`,
    riotId: `${name}#${name === ME.gameName ? ME.tagLine : "EUW"}`,
    summonerName: name,
    team,
    position,
    level,
    isBot: false,
    isDead: false,
    items: items.map((k, slot) => ({ itemID: ITEM[k][0], displayName: ITEM[k][1], slot, count: 1, canUse: false, consumable: false })),
    summonerSpells: {
      summonerSpellOne: { displayName: spells[0], rawDisplayName: `GeneratedTip_SummonerSpell_Summoner${spells[0]}_DisplayName` },
      summonerSpellTwo: { displayName: spells[1], rawDisplayName: `GeneratedTip_SummonerSpell_Summoner${spells[1]}_DisplayName` },
    },
    scores: { kills: 0, deaths: 0, assists: 0, creepScore: 0, wardScore: 0 },
  };
}

function liveGame(gameTime, players) {
  const me = players.find((p) => p.summonerName === ME.gameName);
  return {
    activePlayer: { riotId: me.riotId, summonerName: me.summonerName, level: me.level },
    allPlayers: players,
    events: { Events: [] },
    gameData: { gameMode: "CLASSIC", gameTime, mapName: "Map11", mapNumber: 11, mapTerrain: "Default" },
  };
}

const write = (id, scenario) => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL(`${id}.json`, OUT), JSON.stringify(scenario, null, 2) + "\n");
};

// ---------------------------------------------------------------------------
// 1. Gwen (top, blue) vs Fiora — ranked draft, enemies revealed as they lock.
// ---------------------------------------------------------------------------
{
  const blue = (gwen, intentGwen) => [
    csPlayer(0, gwen ? "Gwen" : null, "top", ["Flash", "Teleport"], 1, { intent: intentGwen ? "Gwen" : null, name: ME.gameName }),
    csPlayer(1, "Vi", "jungle", ["Flash", "Smite"], 1),
    csPlayer(2, "Orianna", "middle", ["Flash", "Teleport"], 1),
    csPlayer(3, "Caitlyn", "bottom", ["Flash", "Heal"], 1),
    csPlayer(4, "Lux", "utility", ["Flash", "Ignite"], 1),
  ];
  const red = (picks) =>
    ["top", "jungle", "middle", "bottom", "utility"].map((_, i) =>
      csPlayer(5 + i, picks[i] ?? null, "", null, 2, { name: "" }),
    );
  const ORDER = (champ, pos, lvl, items, spells, name) => livePlayer(champ, "ORDER", pos, lvl, items, spells, name);
  const CHAOS = (champ, pos, lvl, items, spells, name) => livePlayer(champ, "CHAOS", pos, lvl, items, spells, name);
  const game = (t, lvls, fioraItems, extra = {}) =>
    liveGame(t, [
      ORDER("Gwen", "TOP", lvls[0], extra.gwen ?? ["DoransBlade", "HealthPot"], ["Flash", "Teleport"], ME.gameName),
      ORDER("Vi", "JUNGLE", lvls[1], ["Gustwalker"], ["Flash", "Smite"], "Player1"),
      ORDER("Orianna", "MIDDLE", lvls[2], ["DoransRing"], ["Flash", "Teleport"], "Player2"),
      ORDER("Caitlyn", "BOTTOM", lvls[3], ["DoransBlade"], ["Flash", "Heal"], "Player3"),
      ORDER("Lux", "UTILITY", lvls[4], ["WorldAtlas"], ["Flash", "Ignite"], "Player4"),
      CHAOS("Fiora", "TOP", lvls[5], fioraItems, ["Flash", "Teleport"], "Enemy5"),
      CHAOS("Viego", "JUNGLE", lvls[6], extra.viego ?? ["Mosstomper"], ["Flash", "Smite"], "Enemy6"),
      CHAOS("Ahri", "MIDDLE", lvls[7], ["DoransRing"], ["Flash", "Ignite"], "Enemy7"),
      CHAOS("Jinx", "BOTTOM", lvls[8], extra.jinx ?? ["DoransBlade"], ["Flash", "Heal"], "Enemy8"),
      CHAOS("Thresh", "UTILITY", lvls[9], ["WorldAtlas"], ["Flash", "Exhaust"], "Enemy9"),
    ]);

  write("gwen-vs-fiora", {
    name: "Gwen vs Fiora (top, blue side)",
    description: "Ranked draft: enemies reveal as they lock, then in game Fiora completes Ravenous Hydra.",
    steps: [
      { label: "Lobby", delayMs: 1500, phase: "Lobby", champSelect: null, liveGame: null },
      { label: "Champ select: hovering Gwen, enemies hidden", delayMs: 3000, phase: "ChampSelect",
        champSelect: session(0, blue(false, true), red([]), "BAN_PICK") },
      { label: "Gwen locked; Jinx + Thresh revealed", delayMs: 3000,
        champSelect: session(0, blue(true), red([null, null, null, "Jinx", "Thresh"]), "BAN_PICK") },
      { label: "Viego + Ahri revealed, top still hidden", delayMs: 3000,
        champSelect: session(0, blue(true), red([null, "Viego", "Ahri", "Jinx", "Thresh"]), "BAN_PICK") },
      { label: "Fiora locked (finalization)", delayMs: 4000,
        champSelect: session(0, blue(true), red(["Fiora", "Viego", "Ahri", "Jinx", "Thresh"]), "FINALIZATION") },
      { label: "Loading screen (Live API not up yet)", delayMs: 3000, phase: "InProgress", champSelect: null },
      { label: "1:35 — laning starts", delayMs: 4000,
        liveGame: game(95, [1, 2, 1, 1, 1, 1, 2, 1, 1, 1], ["DoransBlade", "HealthPot"]) },
      { label: "14:05 — Fiora has Tiamat", delayMs: 4000,
        liveGame: game(845, [9, 9, 10, 8, 7, 9, 9, 10, 8, 7], ["DoransBlade", "Tiamat", "Steelcaps", "LongSword"],
          { gwen: ["DoransBlade", "Sheen", "Boots"] }) },
      { label: "21:50 — Fiora finished Ravenous Hydra, Jinx bought QSS", delayMs: 5000,
        liveGame: game(1310, [12, 12, 13, 11, 10, 11, 12, 13, 12, 10], ["RavenousHydra", "Steelcaps", "LongSword"],
          { gwen: ["Nashors", "Boots", "DoransBlade"], jinx: ["Kraken", "Boots", "Qss"] }) },
      { label: "Game over", delayMs: 3000, phase: "EndOfGame", liveGame: null },
    ],
  });
}

// ---------------------------------------------------------------------------
// 2. Amumu (jungle, red side) vs Lee Sin.
// ---------------------------------------------------------------------------
{
  const red = (amumu) => [
    csPlayer(5, "Renekton", "top", ["Flash", "Teleport"], 2),
    csPlayer(6, amumu ? "Amumu" : null, "jungle", ["Flash", "Smite"], 2, { intent: "Amumu", name: ME.gameName }),
    csPlayer(7, "Orianna", "middle", ["Flash", "Teleport"], 2),
    csPlayer(8, "Kaisa", "bottom", ["Flash", "Heal"], 2),
    csPlayer(9, "Nautilus", "utility", ["Flash", "Ignite"], 2),
  ];
  const blue = (picks) =>
    [0, 1, 2, 3, 4].map((i) => csPlayer(i, picks[i] ?? null, "", null, 1, { name: "" }));
  const ORDER = (champ, pos, lvl, items, spells, name) => livePlayer(champ, "ORDER", pos, lvl, items, spells, name);
  const CHAOS = (champ, pos, lvl, items, spells, name) => livePlayer(champ, "CHAOS", pos, lvl, items, spells, name);
  const game = (t, lvls, it = {}) =>
    liveGame(t, [
      ORDER("Darius", "TOP", lvls[0], it.darius ?? ["DoransShield"], ["Flash", "Ghost"], "Enemy0"),
      ORDER("LeeSin", "JUNGLE", lvls[1], it.lee ?? ["Gustwalker"], ["Flash", "Smite"], "Enemy1"),
      ORDER("Syndra", "MIDDLE", lvls[2], it.syndra ?? ["DoransRing"], ["Flash", "Teleport"], "Enemy2"),
      ORDER("Ezreal", "BOTTOM", lvls[3], it.ezreal ?? ["DoransBlade"], ["Flash", "Heal"], "Enemy3"),
      ORDER("Morgana", "UTILITY", lvls[4], ["WorldAtlas"], ["Flash", "Ignite"], "Enemy4"),
      CHAOS("Renekton", "TOP", lvls[5], ["DoransBlade"], ["Flash", "Teleport"], "Player5"),
      CHAOS("Amumu", "JUNGLE", lvls[6], it.amumu ?? ["Mosstomper"], ["Flash", "Smite"], ME.gameName),
      CHAOS("Orianna", "MIDDLE", lvls[7], ["DoransRing"], ["Flash", "Teleport"], "Player7"),
      CHAOS("Kaisa", "BOTTOM", lvls[8], ["DoransBlade"], ["Flash", "Heal"], "Player8"),
      CHAOS("Nautilus", "UTILITY", lvls[9], ["WorldAtlas"], ["Flash", "Ignite"], "Player9"),
    ]);

  write("amumu-vs-leesin-red", {
    name: "Amumu vs Lee Sin (jungle, red side)",
    description: "Red side jungle into an early-game Lee Sin; Morgana support. Covers the 90 s path window.",
    steps: [
      { label: "Champ select: enemies hidden", delayMs: 3000, phase: "ChampSelect",
        champSelect: session(6, red(false), blue([]), "BAN_PICK") },
      { label: "Lee Sin + Morgana revealed", delayMs: 3000,
        champSelect: session(6, red(true), blue([null, "LeeSin", null, null, "Morgana"]), "BAN_PICK") },
      { label: "All locked", delayMs: 5000,
        champSelect: session(6, red(true), blue(["Darius", "LeeSin", "Syndra", "Ezreal", "Morgana"]), "FINALIZATION") },
      { label: "Loading screen", delayMs: 3000, phase: "InProgress", champSelect: null, liveGame: null },
      { label: "1:00 — before camps spawn (path still shown)", delayMs: 4000,
        liveGame: game(60, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]) },
      { label: "2:10 — path collapses after 90 s of game", delayMs: 4000,
        liveGame: game(130, [2, 2, 2, 1, 1, 2, 2, 2, 1, 1]) },
      { label: "16:40 — Syndra bought Mercury's Treads, Ezreal has Qss", delayMs: 5000,
        liveGame: game(1000, [10, 10, 11, 10, 8, 10, 10, 11, 10, 8], {
          syndra: ["Ludens", "Mercs"], ezreal: ["Sheen", "Qss", "Boots"], lee: ["Gustwalker", "Eclipse"],
          amumu: ["Mosstomper", "Sunfire", "Mercs"], darius: ["Steelcaps", "Bramble"] }) },
    ],
  });
}

// ---------------------------------------------------------------------------
// 3. Unsupported champion (Yasuo mid).
// ---------------------------------------------------------------------------
{
  const blue = [
    csPlayer(0, "Malphite", "top", ["Flash", "Teleport"], 1),
    csPlayer(1, "Sejuani", "jungle", ["Flash", "Smite"], 1),
    csPlayer(2, "Yasuo", "middle", ["Flash", "Ignite"], 1, { name: ME.gameName }),
    csPlayer(3, "Ashe", "bottom", ["Flash", "Heal"], 1),
    csPlayer(4, "Leona", "utility", ["Flash", "Ignite"], 1),
  ];
  const red = ["Teemo", "Graves", "Zed", "Ezreal", "Senna"].map((c, i) => csPlayer(5 + i, c, "", null, 2, { name: "" }));
  write("unsupported-champion", {
    name: "Unsupported champion (Yasuo mid)",
    description: "Local player is not on Gwen/Amumu — overlay should say so and stay quiet.",
    steps: [
      { label: "Champ select as Yasuo", delayMs: 6000, phase: "ChampSelect", champSelect: session(2, blue, red, "FINALIZATION") },
      { label: "In game as Yasuo", delayMs: 6000, phase: "InProgress", champSelect: null,
        liveGame: liveGame(300, [
          livePlayer("Malphite", "ORDER", "TOP", 4, ["DoransShield"], ["Flash", "Teleport"], "Player0"),
          livePlayer("Sejuani", "ORDER", "JUNGLE", 4, ["Mosstomper"], ["Flash", "Smite"], "Player1"),
          livePlayer("Yasuo", "ORDER", "MIDDLE", 5, ["DoransBlade"], ["Flash", "Ignite"], ME.gameName),
          livePlayer("Ashe", "ORDER", "BOTTOM", 4, ["DoransBlade"], ["Flash", "Heal"], "Player3"),
          livePlayer("Leona", "ORDER", "UTILITY", 3, ["WorldAtlas"], ["Flash", "Ignite"], "Player4"),
          livePlayer("Teemo", "CHAOS", "TOP", 4, ["DoransRing"], ["Flash", "Ignite"], "Enemy5"),
          livePlayer("Graves", "CHAOS", "JUNGLE", 5, ["Scorchclaw"], ["Flash", "Smite"], "Enemy6"),
          livePlayer("Zed", "CHAOS", "MIDDLE", 5, ["DoransBlade"], ["Flash", "Ignite"], "Enemy7"),
          livePlayer("Ezreal", "CHAOS", "BOTTOM", 4, ["DoransBlade"], ["Flash", "Heal"], "Enemy8"),
          livePlayer("Senna", "CHAOS", "UTILITY", 3, ["WorldAtlas"], ["Flash", "Heal"], "Enemy9"),
        ]) },
    ],
  });
}

// ---------------------------------------------------------------------------
// 4. Partially hidden enemies — blind pick: no assigned positions anywhere, enemy picks
//    only partially known. Exercises role inference (typicalRoles + Smite).
// ---------------------------------------------------------------------------
{
  const blue = [
    csPlayer(0, "Gwen", "", ["Flash", "Teleport"], 1, { name: ME.gameName }),
    csPlayer(1, "Graves", "", ["Flash", "Smite"], 1),
    csPlayer(2, "Ahri", "", ["Flash", "Ignite"], 1),
    csPlayer(3, "Jinx", "", ["Flash", "Heal"], 1),
    csPlayer(4, null, "", ["Flash", "Exhaust"], 1, { intent: "Thresh" }),
  ];
  const red = (picks) => [5, 6, 7, 8, 9].map((cell, i) => csPlayer(cell, picks[i] ?? null, "", null, 2, { name: "" }));
  write("partially-hidden-enemies", {
    name: "Partially hidden enemies (blind pick)",
    description: "No assignedPosition, enemies partly unknown; one ally still hovering. Tests role inference.",
    steps: [
      { label: "2 of 5 enemies known", delayMs: 4000, phase: "ChampSelect",
        champSelect: session(0, blue, red([null, "Darius", null, "LeeSin", null]), "BAN_PICK") },
      { label: "4 of 5 known (Darius, Lee Sin, Lux, Caitlyn) — top laner still hidden", delayMs: 5000,
        champSelect: session(0, blue, red([null, "Darius", "Lux", "LeeSin", "Caitlyn"]), "BAN_PICK") },
    ],
  });
}

console.log("fixtures written to", OUT.pathname);
