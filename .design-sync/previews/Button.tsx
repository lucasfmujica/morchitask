import { Button } from "morchitask";

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">Guardar tarea</Button>
      <Button variant="accent">Empezar foco</Button>
      <Button variant="secondary">Cancelar</Button>
      <Button variant="ghost">Ver detalles</Button>
      <Button variant="danger">Eliminar</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">Chico</Button>
      <Button size="md">Mediano</Button>
      <Button size="lg">Grande</Button>
    </div>
  );
}

export function Disabled() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled>Planificar el día</Button>
      <Button variant="secondary" disabled>
        Cerrar el día
      </Button>
    </div>
  );
}
