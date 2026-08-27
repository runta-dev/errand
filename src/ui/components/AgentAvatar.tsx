import Avatar from "boring-avatars";
import type { Agent } from "@/domain/types";

const RUNTA_AVATAR_COLORS = ["#F07818", "#FFB477", "#FFD7B5", "#F0F0F0", "#DCE5E0"];

export function AgentAvatar({ agent, size = 36 }: { agent: Pick<Agent, "id" | "name">; size?: number }) {
  return <Avatar
    className="agent-avatar"
    name={`runta-avatar-v2:${agent.name.trim().toLocaleLowerCase()}`}
    colors={RUNTA_AVATAR_COLORS}
    variant="beam"
    size={size}
    square
    title={false}
    role="img"
    aria-label={`${agent.name} avatar`}
  />;
}
