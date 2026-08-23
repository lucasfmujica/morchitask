import { Skeleton } from "morchitask";

export function Shapes() {
  return (
    <div className="flex max-w-sm flex-col gap-3">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function Avatar() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="h-10 w-10 rounded-pill" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

export function CardBlock() {
  return <Skeleton className="h-[76px] w-full max-w-sm rounded-card" />;
}
