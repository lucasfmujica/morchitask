import { notFound } from "next/navigation";
import { ReviewView } from "@/components/review/review-view";
import { weekStartOf } from "@/lib/review";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReviewPage({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  if (!ISO_DATE.test(week)) notFound();
  // Any day of the week works in the URL; the review is always keyed by Monday.
  return <ReviewView week={weekStartOf(week)} />;
}
