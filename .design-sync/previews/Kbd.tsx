import { Kbd } from "morchitask";

export function Keys() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Kbd>N</Kbd>
      <Kbd>E</Kbd>
      <Kbd>⌘</Kbd>
      <Kbd>Esc</Kbd>
      <Kbd>⏎</Kbd>
    </div>
  );
}

export function InSentence() {
  return (
    <p className="text-sm text-muted">
      Apretá <Kbd>N</Kbd> para una nueva tarea, o <Kbd>Esc</Kbd> para cerrar.
    </p>
  );
}

export function Combo() {
  return (
    <p className="flex items-center gap-1.5 text-sm text-muted">
      Guardar: <Kbd>⌘</Kbd> + <Kbd>⏎</Kbd>
    </p>
  );
}
