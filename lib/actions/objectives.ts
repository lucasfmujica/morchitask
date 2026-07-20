"use server";

import { auth } from "@/lib/auth";
import * as data from "@/lib/db/queries/objectives";

async function requireSession() {
  const session = await auth();
  if (!session?.householdId) throw new Error("unauthorized");
  return { householdId: session.householdId, userId: session.user.id };
}

export async function getObjectives() {
  const { householdId } = await requireSession();
  return data.listObjectives(householdId);
}

export async function getObjectiveTaskCounts() {
  const { householdId } = await requireSession();
  return data.objectiveTaskCounts(householdId);
}

export async function createObjective(input: {
  title: string;
  period: string;
  start_date: string;
  end_date: string;
}) {
  const { householdId, userId } = await requireSession();
  return data.createObjective(householdId, userId, input);
}

export async function updateObjective(
  id: string,
  patch: { title?: string; status?: string; sort_order?: number },
) {
  const { householdId } = await requireSession();
  await data.updateObjective(householdId, id, patch);
}

export async function deleteObjective(id: string) {
  const { householdId } = await requireSession();
  await data.deleteObjective(householdId, id);
}
