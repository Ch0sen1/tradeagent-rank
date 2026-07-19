export default function StreakBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold bg-tr-gold/10 text-tr-gold border border-tr-gold/20">
      🔥 {n}
    </span>
  );
}
