import type { Profile } from "@/lib/queries/types";

export function OwnerAvatar({ profile, size = 24 }: { profile?: Profile; size?: number }) {
  const name = profile?.display_name ?? "?";
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <span
      title={profile?.display_name}
      aria-label={profile ? `Asignado a ${profile.display_name}` : undefined}
      style={{ width: size, height: size, backgroundColor: profile?.color ?? "var(--color-muted)" }}
      className="inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
    >
      {initial}
    </span>
  );
}
