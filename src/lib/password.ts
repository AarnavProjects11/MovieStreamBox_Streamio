export type PasswordScore = {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Very weak" | "Weak" | "Okay" | "Strong" | "Excellent";
  hints: string[];
  color: string;
};

export function scorePassword(pw: string): PasswordScore {
  const hints: string[] = [];
  let score = 0;

  if (pw.length >= 8) score++;
  else hints.push("Use at least 8 characters");
  if (pw.length >= 14) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  else hints.push("Mix upper- and lower-case");
  if (/\d/.test(pw)) score++;
  else hints.push("Include a number");
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  else hints.push("Add a symbol");

  // collapse to 0..4
  const clamped = Math.max(0, Math.min(4, score - 1)) as 0 | 1 | 2 | 3 | 4;
  const labels = ["Very weak", "Weak", "Okay", "Strong", "Excellent"] as const;
  const colors = [
    "oklch(0.6 0.22 25)",
    "oklch(0.72 0.2 50)",
    "oklch(0.78 0.18 90)",
    "oklch(0.7 0.18 160)",
    "oklch(0.78 0.2 145)",
  ];
  if (!pw) {
    return { score: 0, label: "Very weak", hints: ["Type a password"], color: colors[0] };
  }
  return { score: clamped, label: labels[clamped], hints, color: colors[clamped] };
}

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGIT = "23456789";
const SYMBOL = "!@#$%^&*()-_=+[]{};:,.?";

function pick(pool: string, rnd: () => number) {
  return pool.charAt(Math.floor(rnd() * pool.length));
}

function secureRandom(): () => number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return () => {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] / 0xffffffff;
    };
  }
  return Math.random;
}

export function generatePassword(length = 16): string {
  const rnd = secureRandom();
  const pools = [UPPER, LOWER, DIGIT, SYMBOL];
  const required = pools.map((p) => pick(p, rnd));
  const all = pools.join("");
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => pick(all, rnd));
  const chars = [...required, ...rest];
  // Fisher–Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
