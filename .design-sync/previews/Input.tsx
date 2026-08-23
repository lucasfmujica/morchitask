import { Input } from "morchitask";

export function Default() {
  return (
    <div className="max-w-sm">
      <Input placeholder="¿Qué querés hacer hoy?" />
    </div>
  );
}

export function WithValue() {
  return (
    <div className="max-w-sm">
      <Input defaultValue="Revisar el informe de agosto" />
    </div>
  );
}

export function Disabled() {
  return (
    <div className="max-w-sm">
      <Input placeholder="No se puede editar" disabled />
    </div>
  );
}

export function Labelled() {
  return (
    <div className="flex max-w-sm flex-col gap-1.5">
      <label className="text-sm font-medium text-fg">Nombre de la tarea</label>
      <Input placeholder="Escribí un título corto" />
      <p className="text-xs text-muted">Va a aparecer en la tarjeta del día.</p>
    </div>
  );
}
