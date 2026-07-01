import { FocusAudioPanel } from "@/components/focus/focus-audio-panel";
import { FocusTimer } from "@/components/focus/focus-timer";

export default function FocusPage() {
  return (
    <div className="flex flex-col gap-6">
      <FocusTimer />
      <FocusAudioPanel />
    </div>
  );
}
