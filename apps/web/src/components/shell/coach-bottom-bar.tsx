'use client';
import { NavLinks } from './nav-links';

/** R1b: four labelled phone destinations, above the device's safe area. */
export function CoachBottomBar() {
  return <footer className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur-md [padding-bottom:env(safe-area-inset-bottom)] md:hidden">
    <NavLinks area="coach" layout="tabs" />
  </footer>;
}
