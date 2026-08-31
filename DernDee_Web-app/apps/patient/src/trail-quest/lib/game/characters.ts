export type CharacterId = "boy" | "girl" | "dino";

export type CharacterDef = {
  id: CharacterId;
  name: string;
  nameEn: string;
  poster: string;
  walk: string;
  jump: string;
  duck: string;
  tired?: string;
  feetInClip: number;
  drawHeightFrac: number;
  jumpSeek: number;
  jumpRate: number;
  jumpLift: number;
  duckSeek: number;
  duckRate: number;
  /** Skip the idle/stand intro at the start of walk.mp4. */
  walkSeek: number;
  tiredSeek: number;
  tiredHold: number;
  tiredRate: number;
};

export const CHARACTERS: CharacterDef[] = [
  {
    id: "boy",
    name: "น้องเดินดี",
    nameEn: "Walker",
    poster: "/game/characters/boy/poster.png",
    walk: "/game/characters/boy/walk.mp4",
    jump: "/game/characters/boy/jump.mp4",
    duck: "/game/characters/boy/duck.mp4",
    tired: "/game/characters/boy/tired.mp4",
    feetInClip: 0.82,
    drawHeightFrac: 0.46,
    jumpSeek: 1.65,
    jumpRate: 2.05,
    jumpLift: 0.72,
    duckSeek: 0.85,
    duckRate: 2.45,
    walkSeek: 0.34,
    tiredSeek: 1.1,
    tiredHold: 2.2,
    tiredRate: 1,
  },
  {
    id: "girl",
    name: "น้องสาวเดินดี",
    nameEn: "Walker Girl",
    poster: "/game/characters/girl/poster.png",
    walk: "/game/characters/girl/walk.mp4",
    jump: "/game/characters/girl/jump.mp4",
    duck: "/game/characters/girl/duck.mp4",
    tired: "/game/characters/girl/tired.mp4",
    feetInClip: 0.82,
    drawHeightFrac: 0.46,
    jumpSeek: 1.5,
    jumpRate: 2.1,
    jumpLift: 0.7,
    duckSeek: 0.7,
    duckRate: 2.5,
    walkSeek: 0.34,
    tiredSeek: 1.1,
    tiredHold: 2.2,
    tiredRate: 1,
  },
  {
    id: "dino",
    name: "ไดโนน้อย",
    nameEn: "Dino",
    poster: "/game/characters/dino/poster.png",
    walk: "/game/walk.mp4",
    jump: "/game/jump.mp4",
    duck: "/game/duck.mp4",
    tired: "/game/tired.mp4",
    feetInClip: 0.8,
    drawHeightFrac: 0.42,
    jumpSeek: 2.2,
    jumpRate: 1.35,
    jumpLift: 1,
    duckSeek: 0.5,
    duckRate: 2.55,
    walkSeek: 0.52,
    tiredSeek: 0,
    tiredHold: 1,
    tiredRate: 1,
  },
];

export function isCharacterId(value: unknown): value is CharacterId {
  return value === "boy" || value === "girl" || value === "dino";
}

export function getCharacter(id: CharacterId | string | null | undefined): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
