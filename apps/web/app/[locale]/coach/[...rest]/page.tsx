import { notFound } from "next/navigation";

// Catches every /coach/... URL that has no page yet and renders coach/not-found.tsx inside the coach shell,
// so a navigation link to an unbuilt screen shows a branded "not ready yet" state, not the framework 404.
// Real pages win over this route automatically.
export default function CoachUnbuiltPage() {
  notFound();
}
