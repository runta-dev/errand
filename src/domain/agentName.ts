const SINGLE_NAMES = [
  "Atlas", "Scout", "Mira", "Lumen", "Nova", "Echo", "Sage", "Orbit",
  "Ember", "Cedar", "Pixel", "Quest", "Vale", "Rune", "Iris", "Patch",
] as const;

const FIRST_WORDS = ["Amber", "Bright", "Calm", "Clever", "Golden", "Hidden", "Kind", "Quiet", "Silver", "Swift", "True", "Wild"] as const;
const SECOND_WORDS = ["Brook", "Cedar", "Comet", "Field", "Harbor", "Meadow", "Orbit", "Pine", "River", "Sparrow", "Vale", "Willow"] as const;

export function nextAgentName(existingNames: Iterable<string>): string {
  const used = new Set(Array.from(existingNames, (name) => name.trim().toLocaleLowerCase()).filter(Boolean));
  const availableSingle = SINGLE_NAMES.find((name) => !used.has(name.toLocaleLowerCase()));
  if (availableSingle) return availableSingle;

  for (const first of FIRST_WORDS) {
    for (const second of SECOND_WORDS) {
      const candidate = `${first} ${second}`;
      if (!used.has(candidate.toLocaleLowerCase())) return candidate;
    }
  }

  let suffix = 2;
  while (used.has(`wild harbor ${suffix}`)) suffix += 1;
  return `Wild Harbor ${suffix}`;
}
