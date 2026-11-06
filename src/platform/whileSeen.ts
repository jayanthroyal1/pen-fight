/** Runs `start` while `el` is on screen, and whatever it returns when it leaves. Returns a way to stop for good. */
export function whileSeen(el: Element, start: () => () => void): () => void {
  let stop: (() => void) | null = null;
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) stop ??= start();
    else {
      stop?.();
      stop = null;
    }
  });
  observer.observe(el);
  return () => {
    observer.disconnect();
    stop?.();
  };
}

/** Runs `start` the first time `el` comes on screen. Returns a way to cancel. */
export function onceSeen(el: Element, start: () => void): () => void {
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    start();
  });
  observer.observe(el);
  return () => observer.disconnect();
}
