import Avatar from "boring-avatars";
import type { Agent } from "@/domain/types";
import avatarStyle from "@/shared/avatarStyle.json";

export function AgentAvatar({ agent, size = 36 }: { agent: Pick<Agent, "id" | "name">; size?: number }) {
  return <Avatar
    className="agent-avatar"
    name={`${avatarStyle.seedPrefix}${agent.name.trim().toLocaleLowerCase()}`}
    colors={avatarStyle.colors}
    variant="beam"
    size={size}
    square
    title={false}
    role="img"
    aria-label={`${agent.name} avatar`}
  />;
}
