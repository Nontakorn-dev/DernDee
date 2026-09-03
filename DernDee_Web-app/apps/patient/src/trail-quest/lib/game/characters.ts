export type CharacterId = "boy" | "girl" | "dino";

export type CharacterDef = {
  id: CharacterId;
  name: string;
  nameEn: string;
  poster: string;
  feetInClip: number;
  drawHeightFrac: number;
  jumpLift: number;
};

export const CHARACTERS: CharacterDef[] = [
  {
    id: "boy",
    name: "น้องเดินดี",
    nameEn: "Walker",
    poster: "/game/characters/boy/poster.png",
    feetInClip: 0.82,
    drawHeightFrac: 0.46,
    jumpLift: 0.72,
  },
  {
    id: "girl",
    name: "น้องสาวเดินดี",
    nameEn: "Walker Girl",
    poster: "/game/characters/girl/poster.png",
    feetInClip: 0.82,
    drawHeightFrac: 0.46,
    jumpLift: 0.7,
  },
  {
    id: "dino",
    name: "ไดโนน้อย",
    nameEn: "Dino",
    poster: "/game/characters/dino/poster.png",
    feetInClip: 0.8,
    drawHeightFrac: 0.42,
    jumpLift: 1,
  },
];

export function isCharacterId(value: unknown): value is CharacterId {
  return value === "boy" || value === "girl" || value === "dino";
}

export function getCharacter(id: CharacterId | string | null | undefined): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
