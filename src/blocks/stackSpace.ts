// The room a <BannerStack> (kit.tsx) takes at the bottom of the screen. While a fixed stack shows,
// --banner-stack-space on <html> says how far its top sits above the bottom of the screen. kit.css
// pads the bottom of <body> by that much, so the last button on a page scrolls up above the
// banners, and checkin.css lifts the late banner (LateBanner) above them.
export const STACK_SPACE = "--banner-stack-space";
const spaces = new Map<object, number>();

// How far the top of a fixed stack sits above the bottom of the screen, in whole px; 0 for a
// stack that isn't fixed (the one shown in place on #/ui) or has no height.
export function pinnedSpace(rect: { top: number; height: number }, screenHeight: number, position: string): number {
  if (position !== "fixed" || rect.height <= 0) return 0;
  return Math.max(0, Math.ceil(screenHeight - rect.top));
}

// Records one stack's space (0 or undefined: it has none, or it's gone) and writes the largest
// on `root`, or takes the property off when no stack has any.
export function setStackSpace(root: { style: Pick<CSSStyleDeclaration, "setProperty" | "removeProperty"> }, stack: object, space: number | undefined) {
  if (space) spaces.set(stack, space);
  else spaces.delete(stack);
  const most = Math.max(0, ...spaces.values());
  if (most > 0) root.style.setProperty(STACK_SPACE, `${most}px`);
  else root.style.removeProperty(STACK_SPACE);
}
