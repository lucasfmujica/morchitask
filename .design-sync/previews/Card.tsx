import { Card, Badge } from "morchitask";

export function Elevations() {
  return (
    <div className="flex flex-col gap-4">
      <Card elevation="flat">
        <p className="font-semibold text-fg">Plano</p>
        <p className="mt-1 text-sm text-muted">Sin sombra, sólo el borde.</p>
      </Card>
      <Card elevation="soft">
        <p className="font-semibold text-fg">Suave</p>
        <p className="mt-1 text-sm text-muted">La tarjeta en reposo.</p>
      </Card>
      <Card elevation="raised">
        <p className="font-semibold text-fg">Elevada</p>
        <p className="mt-1 text-sm text-muted">Al pasar el mouse por encima.</p>
      </Card>
    </div>
  );
}

export function TaskCard() {
  return (
    <Card elevation="raised" className="max-w-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-fg">Revisar el informe de agosto</p>
        <Badge variant="accent">45 min</Badge>
      </div>
      <p className="mt-2 text-sm text-muted">
        Chequear los números de la segunda quincena antes de mandarlo.
      </p>
      <div className="mt-3 flex gap-2">
        <Badge variant="primary">Trabajo</Badge>
        <Badge>Hoy</Badge>
      </div>
    </Card>
  );
}

export function Padding() {
  return (
    <div className="flex flex-col gap-3">
      <Card padding="sm">
        <p className="text-sm text-fg">Padding chico</p>
      </Card>
      <Card padding="md">
        <p className="text-sm text-fg">Padding mediano</p>
      </Card>
      <Card padding="lg">
        <p className="text-sm text-fg">Padding grande</p>
      </Card>
    </div>
  );
}
