import names from "@/data/rbi-nbfc-names.json";

const LENDER_NAMES = names as string[];
const LENDER_SET = new Set(LENDER_NAMES);

export function isRegisteredLender(name: string): boolean {
  return LENDER_SET.has(name);
}

export function searchLenders(query: string, limit = 50): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return LENDER_NAMES.slice(0, limit);

  const matches: string[] = [];
  for (const name of LENDER_NAMES) {
    if (name.toLowerCase().includes(q)) {
      matches.push(name);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}
