import { notFound } from "next/navigation";
import { MonthView } from "@/components/month/month-view";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function MonthPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!ISO_DATE.test(date)) notFound();
  return <MonthView date={date} />;
}
