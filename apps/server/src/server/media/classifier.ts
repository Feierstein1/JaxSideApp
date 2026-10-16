/**
 * P6.6: the hook for automated image screening (§12 "advanced automated image
 * classification can be added behind a moderation interface"). Nothing is configured by
 * default, so every photo is allowed and people's reports plus moderators do the work.
 *
 * A future classifier (a hosted service or a local model) implements this interface and
 * is installed with `setImageClassifier`. It must never punish anyone by itself (§11.2):
 * "hold" should send the photo to the moderation queue; "block" refuses the upload.
 */
export interface ImageVerdict {
  action: 'allow' | 'hold' | 'block';
  /** e.g. ["nudity", "violence"] with whatever confidence the classifier gives. */
  labels?: { label: string; confidence: number }[];
}

export interface ImageClassifier {
  classify(jpeg: Buffer): Promise<ImageVerdict>;
}

const allowAll: ImageClassifier = { classify: async () => ({ action: 'allow' }) };

let current: ImageClassifier = allowAll;
export const imageClassifier = () => current;
export function setImageClassifier(c: ImageClassifier | null) {
  current = c ?? allowAll;
}
