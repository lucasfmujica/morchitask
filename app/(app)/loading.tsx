import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown the instant a screen is clicked. Every page here is rendered per
 * request (it needs the session), and without a loading boundary Next can't
 * prefetch anything for them: the click sat on the old screen until the server
 * answered, which read as the app lagging between views.
 */
export default async function AppLoading() {
  const t = await getTranslations("common");
  return (
    <div aria-busy className="flex flex-col gap-4">
      <span className="sr-only" role="status">
        {t("loading")}
      </span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64 rounded-lg" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
