import Avatar from "boring-avatars";
import type { Agent } from "@/domain/types";

const RUNTA_AVATAR_COLORS = ["#F07818", "#FFB477", "#1F1E1E", "#DCE5E0", "#E5E8EE"];

export function AgentAvatar({ agent, size = 36 }: { agent: Pick<Agent, "id" | "name">; size?: number }) {
  return <Avatar
    className="agent-avatar"
    name={`runta-avatar-v2:${agent.id}`}
    colors={RUNTA_AVATAR_COLORS}
    variant="beam"
    size={size}
    square
    title={false}
    role="img"
    aria-label={`${agent.name} avatar`}
  />;
}
