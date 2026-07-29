"use client";

import { useState } from "react";
import type { Profile } from "@/lib/queries/types";

/**
 * A person's photo, or their coloured initial.
 *
 * Falls back to the initial when the image fails to load, not just when there
 * is no `avatar_url`. That matters: the stored URLs point at Supabase Storage
 * from before the move to Neon, so they 404 and every avatar in the app was
 * rendering as a broken-image icon. The fallback makes the component honest
 * regardless of WHY the photo is unavailable — a dead host, an offline phone,
 * or a deleted file.
 */
export function OwnerAvatar({
  profile,
  size = 24,
  title,
}: {
  profile?: Profile;
  size?: number;
  title?: string;
}) {
  const url = profile?.avatar_url;
  const [broken, setBroken] = useState(false);

  // A different person (or a re-uploaded photo) deserves a fresh attempt.
  // Adjusted during render rather than in an effect, so there's no flash of the
  // fallback before the new image is tried.
  const [lastUrl, setLastUrl] = useState(url);
  if (lastUrl !== url) {
    setLastUrl(url);
    setBroken(false);
  }

  const name = profile?.display_name ?? "?";
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const label = title ?? profile?.display_name;

  if (url && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        title={label}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        onError={() => setBroken(true)}
        className="inline-block shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span
      title={label}
      aria-label={profile ? `Asignado a ${profile.display_name}` : undefined}
      style={{ width: size, height: size, backgroundColor: profile?.color ?? "var(--color-muted)" }}
      className="inline-flex shrink-0 items-center justify-center rounded-full text-2xs font-bold text-white"
    >
      {initial}
    </span>
  );
}
