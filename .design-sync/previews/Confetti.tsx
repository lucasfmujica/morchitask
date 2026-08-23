import { Confetti, Card, Badge } from "morchitask";

/* Confetti is a one-shot full-viewport burst: it mounts, rains 42 pieces over
   ~2s, then fires onDone so the parent unmounts it. A still frame can't do it
   justice — these cards show the moment it fires, so the trigger context reads
   even when the capture lands after the pieces have fallen. */

export function DayClosed() {
  return (
    <Card elevation="raised" className="relative max-w-sm overflow-hidden text-center">
      <Confetti />
      <p className="text-lg font-semibold text-fg">¡Día cerrado!</p>
      <p className="mt-1 text-sm text-muted">Terminaste 6 de 7 tareas. Nos vemos mañana.</p>
      <div className="mt-3 flex justify-center gap-2">
        <Badge variant="success">6 terminadas</Badge>
        <Badge variant="neutral">1 pasa a mañana</Badge>
      </div>
    </Card>
  );
}

export function StreakReached() {
  return (
    <Card elevation="raised" className="relative max-w-sm overflow-hidden text-center">
      <Confetti />
      <p className="text-lg font-semibold text-fg">7 días seguidos</p>
      <p className="mt-1 text-sm text-muted">Cerraste el día toda la semana.</p>
    </Card>
  );
}
