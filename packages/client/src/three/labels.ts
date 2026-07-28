/**
 * Screen-space anchors for the name tags and chat bubbles that float over
 * avatars.
 *
 * The alternative - drei's <Html> per avatar - creates a DOM node and a
 * transform update per player per frame, inside the render loop. Instead one
 * component inside the canvas projects every avatar in a single pass and
 * writes here; one component outside the canvas reads it on an animation
 * frame and moves the nodes. React renders neither.
 */
export interface LabelAnchor {
  x: number;
  y: number;
  visible: boolean;
  distance: number;
}

export const labelAnchors = new Map<string, LabelAnchor>();

/** Beyond this many metres a name tag is noise, not information. */
export const LABEL_MAX_DISTANCE = 22;

/** Chat bubbles currently floating above heads, keyed by session id. */
export const chatBubbles = new Map<string, { text: string; until: number }>();

export const BUBBLE_DURATION_MS = 5_000;

export function showBubble(sessionId: string, text: string): void {
  chatBubbles.set(sessionId, { text, until: Date.now() + BUBBLE_DURATION_MS });
}
