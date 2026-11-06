/**
 * D203: one voice clip or video plays at a time, and it belongs to a post. When its post
 * scrolls out of view or is opened, it stops and resets (a video back to its play tile, a clip
 * back to the start).
 */
interface Playing {
  key: string;
  stop: () => void;
}

let current: Playing | null = null;

/** A player calls this when it starts. Whatever else was playing stops. Returns the release. */
export function claimMedia(key: string, stop: () => void): () => void {
  if (current && current.stop !== stop) stopMedia();
  const mine: Playing = { key, stop };
  current = mine;
  return () => {
    if (current === mine) current = null;
  };
}

/** Stops what is playing (opening a post, leaving the screen). */
export function stopMedia() {
  const c = current;
  current = null;
  try {
    c?.stop();
  } catch {
    // the player is already gone
  }
}

/** Lists call this with the posts on screen: the playing one is stopped if it isn't among them. */
export function stopMediaNotIn(visibleKeys: ReadonlySet<string>) {
  if (current && !visibleKeys.has(current.key)) stopMedia();
}
