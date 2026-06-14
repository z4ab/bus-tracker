interface SkeletonCardProps {
  lines?: number;
}

export function SkeletonCard({ lines = 3 }: SkeletonCardProps) {
  return (
    <div className="animate-pulse space-y-2 bg-white rounded-lg p-3">
      <div className="h-3 bg-gray-200 rounded w-3/4" />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-2.5 bg-gray-200 rounded"
          style={{ width: `${Math.max(40, 80 - i * 15)}%` }}
        />
      ))}
    </div>
  );
}

export function SkeletonLine({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse flex items-center gap-2 ${className ?? ""}`}>
      <div className="w-3 h-3 rounded-full bg-gray-200 shrink-0" />
      <div className="h-3 bg-gray-200 rounded flex-1" />
    </div>
  );
}
