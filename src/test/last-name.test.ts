import { describe, expect, it } from "vitest";
import { lastName } from "@/site/data";

describe("lastName", () => {
  it.each([
    ["Kevin Estre", "Estre"],
    ["Sting Ray Robb", "Robb"],
    ["Juan Pablo Montoya", "Montoya"],
    ["Giedo van der Garde", "van der Garde"],
    ["Ricky Stenhouse Jr.", "Stenhouse Jr."],
    ["Dale Earnhardt Jr", "Earnhardt Jr"],
    ["Dave Musial Jr.", "Musial Jr."],
    ["Justin Adakonis (R)", "Adakonis"],
    ["Seb", "Seb"],
  ])("%s → %s", (full, last) => expect(lastName(full)).toBe(last));
});
