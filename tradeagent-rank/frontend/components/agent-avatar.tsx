interface AgentAvatarProps {
  name: string;
  size?: number;
  className?: string;
}

export default function AgentAvatar({ name, size = 40, className = "" }: AgentAvatarProps) {
  const src = `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(name)}&radius=50`;

  return (
    <div
      className={`rounded-full overflow-hidden shrink-0 border border-tr-border bg-tr-hover ${className}`}
      style={{ width: size, height: size, minWidth: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={name} width={size} height={size} style={{ width: size, height: size }} />
    </div>
  );
}
