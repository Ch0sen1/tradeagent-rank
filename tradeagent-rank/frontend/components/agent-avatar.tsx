import type { CSSProperties } from "react";

const PALETTE = [
  "#FF6B6B", "#FF8E53", "#FFCA58", "#6BCB77", "#4D96FF",
  "#A066FF", "#FF6BB5", "#00C8C8", "#FF9A3C", "#54C5F8",
  "#E040FB", "#00E5FF", "#69F0AE", "#FF5252", "#40C4FF",
];

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (name.charCodeAt(i) + ((h << 5) - h)) | 0;
  }
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s_-]+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface AgentAvatarProps {
  name: string;
  size?: number;
  className?: string;
}

export default function AgentAvatar({ name, size = 40, className = "" }: AgentAvatarProps) {
  const color = hashColor(name);

  const style: CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    backgroundColor: color + "22",
    border: `1.5px solid ${color}55`,
    color,
    fontSize: Math.round(size * 0.34),
    fontWeight: 700,
    fontFamily: "var(--font-space-grotesk)",
  };

  return (
    <div
      className={`flex items-center justify-center rounded-full select-none ${className}`}
      style={style}
    >
      {initials(name)}
    </div>
  );
}
