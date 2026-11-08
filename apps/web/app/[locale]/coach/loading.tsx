import { PageSkeleton } from "@/src/components/shell/page-skeleton";

// Rendered inside the coach layout, so the shell (wordmark, navigation, locale switch) is already on screen.
export default function CoachLoading() {
  return <PageSkeleton variant="dashboard" />;
}
