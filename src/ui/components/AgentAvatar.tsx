import type { Agent } from "@/domain/types";

const backgrounds = ["#EAF3FF", "#F4EEFF", "#EAF7F0", "#FFF1E8", "#EEF5F4", "#F6F1E9"];
const skins = ["#F2C7A5", "#E8B48D", "#D99A6C", "#B97049", "#875034", "#633A29"];
const hairs = ["#24201E", "#4A3027", "#7A4D2B", "#B56A3A", "#D6B073", "#5A4B47"];
const shirts = ["#3569A8", "#4E8B72", "#8A5FA3", "#C46D4B", "#5E6F86", "#C18B34"];

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

function random(seed: number) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
}

function pick<T>(items: readonly T[], next: () => number): T { return items[Math.floor(next() * items.length)] ?? items[0]!; }

const hairPaths = [
  "M17 29c0-13 8-21 20-21 10 0 18 8 18 21-4-7-10-11-19-11-8 0-14 4-19 11Z",
  "M16 31C14 16 23 8 36 8c14 0 21 11 19 25-4-10-10-15-20-15-8 0-14 5-19 13Z",
  "M17 29C19 14 29 7 43 10c7 2 12 9 12 18-8-8-18-11-38 1Z",
  "M16 30C16 15 25 8 36 8c12 0 20 9 20 21-5-7-9-10-15-11-3 6-12 10-25 12Z",
  "M17 31C15 18 23 8 35 8c12 0 21 8 21 20-5-6-10-9-17-10-4 6-11 10-22 13Z",
];

export function AgentAvatar({ agent, size = 36 }: { agent: Pick<Agent, "id" | "name">; size?: number }) {
  const next = random(hashString(`runta-avatar-v1:${agent.id}`));
  const background = pick(backgrounds, next); const skin = pick(skins, next); const hair = pick(hairs, next); const shirt = pick(shirts, next);
  const hairPath = pick(hairPaths, next); const tilt = Math.round(next() * 6 - 3); const eyeOffset = next() > .5 ? 0 : 1;
  const glasses = next() > .72; const freckles = next() > .68; const accessory = next() > .76;
  const smileDepth = 2 + Math.round(next() * 2);
  return <svg className="agent-avatar" style={{ width: size, height: size }} viewBox="0 0 64 64" role="img" aria-label={`${agent.name} avatar`}>
    <rect width="64" height="64" rx="18" fill={background} />
    <g transform={`rotate(${tilt} 32 34)`}>
      <path d="M9 64c2-15 11-22 23-22s22 7 24 22H9Z" fill={shirt} />
      <path d="M27 39h11v10H27z" fill={skin} />
      <circle cx="32" cy="29" r="16" fill={skin} />
      <path d={hairPath} fill={hair} />
      <circle cx={26 - eyeOffset} cy="30" r="1.6" fill="#292321" />
      <circle cx={38 + eyeOffset} cy="30" r="1.6" fill="#292321" />
      <path d={`M27 36q5 ${smileDepth} 10 0`} fill="none" stroke="#8D4C43" strokeWidth="1.5" strokeLinecap="round" />
      {glasses && <g fill="none" stroke="#554F4B" strokeWidth="1.2"><circle cx="25.5" cy="29.5" r="4" /><circle cx="38.5" cy="29.5" r="4" /><path d="M29.5 29.5h5" /></g>}
      {freckles && <g fill="#A96950" opacity=".65"><circle cx="23" cy="34" r=".6" /><circle cx="25.5" cy="34.8" r=".55" /><circle cx="40" cy="34" r=".6" /></g>}
      {accessory && <circle cx="47" cy="34" r="1.6" fill="#E4A72F" />}
    </g>
  </svg>;
}
