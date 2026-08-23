import { Badge } from "morchitask";

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="neutral">Bandeja</Badge>
      <Badge variant="primary">Trabajo</Badge>
      <Badge variant="accent">45 min</Badge>
      <Badge variant="success">Terminada</Badge>
      <Badge variant="danger">Atrasada</Badge>
    </div>
  );
}

export function InContext() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="primary">Personal</Badge>
      <Badge variant="neutral">Mañana</Badge>
      <Badge variant="accent">2 h</Badge>
    </div>
  );
}
