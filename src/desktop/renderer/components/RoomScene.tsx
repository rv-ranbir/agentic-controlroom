import { useStore } from "../store";
import { bucketOf, initials } from "../lib/agents";
import type { AgentRef, Bucket } from "../types";
import roomBg from "../assets/illustration/room-background.svg";
import spriteIdle from "../assets/illustration/character-idle.svg";
import spriteTalking from "../assets/illustration/character-talking.svg";
import spriteTyping from "../assets/illustration/character-typing.svg";
import spriteAway from "../assets/illustration/character-away.svg";

// M10 phase 4b: skeuomorphic room backdrop for Chat Board + Meeting Room.
// Bucket -> sprite: "active" (agent working) reads as typing, "needs"/"review"
// (agent has something to say) reads as talking, "seen" (already reviewed,
// out of focus) reads as away, everything else is idle.
const SPRITE_BY_BUCKET: Record<Bucket, string> = {
  active: spriteTyping,
  needs: spriteTalking,
  review: spriteTalking,
  seen: spriteAway,
  idle: spriteIdle,
};

export function RoomScene({ agents }: { agents: AgentRef[] }) {
  const agentStates = useStore((s) => s.agentStates);
  const localSeen = useStore((s) => s.localSeen);
  const localForceActive = useStore((s) => s.localForceActive);

  return (
    <div className="roomScene" style={{ backgroundImage: `url("${roomBg}")` }}>
      <div className="roomSpriteRow">
        {agents.map((a) => {
          const bucket = bucketOf(a.id, { agentStates, localSeen, localForceActive });
          return (
            <div key={a.id} className="roomSprite">
              <img src={SPRITE_BY_BUCKET[bucket]} alt={bucket} />
              <span className="mono">{initials(a.name)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
