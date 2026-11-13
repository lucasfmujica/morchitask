"use server";

import { requireSession, requireWriteAccess } from "@/lib/actions/session";
import * as data from "@/lib/db/queries/objectives";

export async function getObjectives() {
  const { householdId, userId } = await requireSession();
  return data.listObjectives(householdId, userId);
}

export async function getObjectiveTaskCounts() {
  const { householdId, userId } = await requireSession();
  return data.objectiveTaskCounts(householdId, userId);
}

export async function createObjective(input: {
  title: string;
  period: string;
  start_date: string;
  end_date: string;
}) {
  const { householdId, userId } = await requireWriteAccess();
  return data.createObjective(householdId, userId, input);
}

/** `patch` is untyped JSON: the data layer keeps only title, status and order. */
export async function updateObjective(
  id: string,
  patch: { title?: string; status?: string; sort_order?: number },
) {
  const { householdId, userId } = await requireWriteAccess();
  await data.updateObjective(householdId, userId, id, patch);
}

export async function deleteObjective(id: string) {
  const { householdId, userId } = await requireWriteAccess();
  await data.deleteObjective(householdId, userId, id);
}
