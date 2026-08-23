import { EmptyHint } from "morchitask";

export function Default() {
  return (
    <div className="w-80">
      <EmptyHint>Nada para hoy</EmptyHint>
    </div>
  );
}

export function InWeekColumn() {
  return (
    <div className="flex w-80 flex-col gap-2">
      <p className="text-2xs font-semibold tracking-wide text-subtle uppercase">Jueves 27</p>
      <EmptyHint>Arrastrá una tarea acá</EmptyHint>
    </div>
  );
}

export function Narrow() {
  return (
    <div className="w-48">
      <EmptyHint>Sin tareas</EmptyHint>
    </div>
  );
}
