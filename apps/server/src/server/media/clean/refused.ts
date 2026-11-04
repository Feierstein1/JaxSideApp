/**
 * D195: media cleaning, shared with the owner website. The JaxSideBusiness repo copies this
 * folder as-is (like `shared/`), so both sides clean uploads the same way. Keep it
 * self-contained: no imports outside this folder except `sharp` and Node built-ins. The app
 * is the source; change it here and tell the website (hub inbox) to copy it again.
 */

/** An upload that isn't an acceptable image or video; the message is for the person. */
export class MediaRefused extends Error {
  readonly status = 422;
  constructor(
    readonly code: 'INVALID_IMAGE' | 'INVALID_VIDEO',
    message: string,
  ) {
    super(message);
    this.name = 'MediaRefused';
  }
}
