import { PageSkeleton } from "@/src/components/shell/page-skeleton";

// Rendered inside the client layout, so the shell (wordmark, links, tab bar) is already on screen.
export default function ClientAppLoading() {
  return <PageSkeleton />;
}
