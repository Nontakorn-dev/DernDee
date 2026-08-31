/** iPad / iPhone / Bluefy — WebKit throttles detached videos and CPU chroma. */
export function isConstrainedWebKit() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return iOS || /Bluefy/i.test(ua);
}
