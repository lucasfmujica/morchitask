import { notFound } from "next/navigation";
import { PlanView } from "@/components/plan/plan-view";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function PlanPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!ISO_DATE.test(date)) notFound();
  return <PlanView date={date} />;
}
