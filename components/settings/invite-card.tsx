"use client";

import { useState } from "react";
import { Check, Copy, Mail, X } from "lucide-react";
import { useInviteActions, useInvites } from "@/lib/queries/invites";

/**
 * Invite one person into this space.
 *
 * There is no transactional email yet, so the invite is delivered by the person
 * sending it: they copy a link and send it however they already talk. The link
 * is a convenience — what actually lets someone in is signing up with the
 * invited address.
 */
export function InviteCard() {
  const { data, isLoading } = useInvites();
  const { invite, revoke } = useInviteActions();
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const invites = data?.invites ?? [];
  const full = data ? data.members + invites.length >= data.max : false;

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/login?invite=${token}`);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Mail className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">Invitar a alguien</p>
          <p className="text-xs text-muted">
            Van a ver las tareas que marques como compartidas. Cada uno mantiene las suyas privadas.
          </p>
        </div>
      </div>

      {!isLoading && !full && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate(email, { onSuccess: () => setEmail("") });
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="su.mail@ejemplo.com"
            aria-label="Mail de la persona que querés invitar"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-subtle focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={invite.isPending || !email.trim()}
            className="shrink-0 cursor-pointer rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {invite.isPending ? "Enviando…" : "Invitar"}
          </button>
        </form>
      )}

      {invite.isError && (
        <p role="alert" className="text-xs text-danger">
          {invite.error instanceof Error ? invite.error.message : "No se pudo invitar."}
        </p>
      )}

      {full && invites.length === 0 && (
        <p className="text-xs text-muted">
          Tu espacio ya está completo. Podés usar la app solo — compartir es opcional.
        </p>
      )}

      {invites.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {invites.map((i) => (
            <li key={i.id} className="flex items-center gap-2 p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg">{i.email}</p>
                <p className="text-xs text-subtle">
                  Invitación pendiente · vence el{" "}
                  {new Date(i.expires_at).toLocaleDateString("es-AR", {
                    day: "numeric",
                    month: "long",
                  })}
                </p>
              </div>
              <button
                onClick={() => copyLink(i.token)}
                aria-label={`Copiar el link de invitación de ${i.email}`}
                className="shrink-0 cursor-pointer rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                {copied === i.token ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
              <button
                onClick={() => revoke.mutate(i.id)}
                aria-label={`Cancelar la invitación de ${i.email}`}
                className="shrink-0 cursor-pointer rounded-lg p-2 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
