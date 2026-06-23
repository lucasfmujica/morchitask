import { notFound } from "next/navigation";
import { ShutdownView } from "@/components/shutdown/shutdown-view";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ShutdownPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!ISO_DATE.test(date)) notFound();
  return <ShutdownView date={date} />;
}
