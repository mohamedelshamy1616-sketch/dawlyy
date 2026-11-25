import { ViewTransition, type ReactNode } from "react";

export function RouteTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      default="none"
      enter={{ default: "page-in", "tab-forward": "tab-next-in", "tab-back": "tab-prev-in" }}
      exit={{ default: "page-out", "tab-forward": "tab-next-out", "tab-back": "tab-prev-out" }}
    >
      {children}
    </ViewTransition>
  );
}
