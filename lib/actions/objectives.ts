"use server";

import { requireSession, requireWriteAccess } from "@/lib/actions/session";
import * as data from "@/lib/db/queries/objectives";

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
  const { householdId, userId } = await requireWriteAccess();
  return data.createObjective(householdId, userId, input);
}

export async function updateObjective(
  id: string,
  patch: { title?: string; status?: string; sort_order?: number },
) {
  const { householdId } = await requireWriteAccess();
  await data.updateObjective(householdId, id, patch);
}

export async function deleteObjective(id: string) {
  const { householdId } = await requireWriteAccess();
  await data.deleteObjective(householdId, id);
}
