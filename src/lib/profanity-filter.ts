const BLOCKED_WORDS = [
  "fuck","shit","ass","bitch","damn","cunt","dick","cock","pussy","bastard",
  "whore","slut","faggot","nigger","nigga","retard","twat","wanker","prick",
  "asshole","bullshit","motherfucker","dumbass","jackass","shithead","fuckface",
  "dickhead","crap","douche","penis","vagina","boob","tit","anus","dildo",
];

const BLOCKED_REGEX = new RegExp(
  `\\b(${BLOCKED_WORDS.join("|")})\\b`,
  "i"
);

export function containsProfanity(text: string): boolean {
  return BLOCKED_REGEX.test(text);
}

export function checkFieldsForProfanity(fields: Record<string, string | null | undefined>): string | null {
  for (const [key, value] of Object.entries(fields)) {
    if (value && containsProfanity(value)) {
      return key;
    }
  }
  return null;
}
