import { LandingState } from "@/src/components/shell/landing-state";

// Shown while any /[locale] page streams in and has no closer loading.tsx (the coach and client
// areas have their own, inside their shell). Branded, never blank.
export default function LocaleLoading() {
  return <LandingState />;
}
