import { notFound } from "next/navigation";

// Catches every /app/... URL that has no page yet and renders app/not-found.tsx inside the client shell,
// so a tab for an unbuilt screen shows a branded "not ready yet" state, not the framework 404.
// Real pages win over this route automatically.
export default function ClientUnbuiltPage() {
  notFound();
}
