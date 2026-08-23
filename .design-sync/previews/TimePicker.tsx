import { TimePicker, Card } from "morchitask";

/* The dropdown opens on click and holds its open state internally, so a static
   card can only show the closed trigger. See NOTES.md. */

export function Empty() {
  return <TimePicker onChange={() => {}} />;
}

export function WithValue() {
  return <TimePicker value="09:30" onChange={() => {}} />;
}

export function InTaskRow() {
  return (
    <Card className="flex max-w-sm items-center justify-between gap-3">
      <span className="text-sm text-fg">Revisar el informe</span>
      <TimePicker value="14:00" onChange={() => {}} align="right" />
    </Card>
  );
}

export function CustomPlaceholder() {
  return <TimePicker placeholder="Empezar a las…" onChange={() => {}} />;
}
