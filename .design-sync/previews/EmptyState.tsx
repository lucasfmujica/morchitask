import { EmptyState, Button } from "morchitask";
import { CalendarCheck, Inbox } from "lucide-react";

export function Default() {
  return (
    <EmptyState
      icon={Inbox}
      title="No hay nada en la bandeja"
      hint="Todo lo que anotes sin fecha va a aparecer acá."
    />
  );
}

export function WithKeyboardTip() {
  return (
    <EmptyState
      icon={CalendarCheck}
      title="El día está vacío"
      hint="Arrastrá tareas desde la bandeja o creá una nueva."
      kbd="N"
      kbdHint="para una nueva tarea"
    />
  );
}

export function WithAction() {
  return (
    <EmptyState
      icon={CalendarCheck}
      title="Todavía no planificaste el día"
      hint="Elegí en qué querés enfocarte antes de arrancar."
      action={<Button variant="accent">Planificar el día</Button>}
    />
  );
}
