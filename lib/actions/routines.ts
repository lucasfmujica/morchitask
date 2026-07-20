"use server";

import { auth } from "@/lib/auth";
import * as data from "@/lib/db/queries/routines";
import type { RoutineInput } from "@/lib/db/queries/routines";

async function requireSession() {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  return { householdId: session.householdId, userId: session.user.id };
}

export async function getMyRoutines() {
  const { householdId, userId } = await requireSession();
  return data.listMyRoutines(householdId, userId);
}

export async function createRoutine(input: RoutineInput) {
  const { householdId, userId } = await requireSession();
  return data.createRoutine(householdId, userId, input);
}

export async function updateRoutine(id: string, patch: Partial<RoutineInput>) {
  const { householdId } = await requireSession();
  await data.updateRoutine(householdId, id, patch);
}

export async function deleteRoutine(id: string) {
  const { householdId } = await requireSession();
  await data.deleteRoutine(householdId, id);
}

export async function getRoutineStreaks(since: string) {
  const { householdId, userId } = await requireSession();
  return data.routineStreaks(householdId, userId, since);
}

export async function ensureDayMaterialized(date: string) {
  const { householdId, userId } = await requireSession();
  await data.ensureDayMaterialized(householdId, userId, date);
}
