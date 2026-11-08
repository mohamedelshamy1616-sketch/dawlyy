import { notFound } from "next/navigation";

// Any other unknown URL under a locale renders [locale]/not-found.tsx (branded) instead of the framework 404.
export default function UnknownPage() {
  notFound();
}
