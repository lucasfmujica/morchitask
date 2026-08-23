import { SkeletonList } from "morchitask";

export function Default() {
  return (
    <div className="max-w-sm">
      <SkeletonList />
    </div>
  );
}

export function LongerList() {
  return (
    <div className="max-w-sm">
      <SkeletonList count={5} />
    </div>
  );
}

export function CompactRows() {
  return (
    <div className="max-w-sm">
      <SkeletonList count={4} rowClassName="h-11" />
    </div>
  );
}
