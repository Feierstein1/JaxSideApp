/**
 * P2.8: integration point for platform app-integrity checks (§6.2, §1 rule 6).
 *
 * - Android: Google Play Integrity API (needs a Google Cloud project linked to the
 *   Play Console listing; free quota).
 * - iOS: Apple App Attest (needs an Apple Developer account and an App ID with the
 *   App Attest capability).
 *
 * Neither credential exists yet (docs/EXTERNAL_SERVICES.md), so every installation is
 * recorded as "unverified" and nothing is blocked on integrity. These signals are
 * advisory: they raise confidence but can't prove a device is honest (R1, R2).
 *
 * To enable later: implement a verifier per platform, have the app send an attestation
 * when it registers its installation, store the verdict in Installation.integrityStatus,
 * and decide (config-driven) which actions require "verified".
 */

export type IntegrityStatus = 'unverified' | 'verified' | 'failed';

export interface IntegrityVerifier {
  readonly platform: 'android' | 'ios';
  /** Verifies a platform attestation token bound to the installation. */
  verify(installationId: string, attestation: string): Promise<IntegrityStatus>;
}

/** Used until credentials exist: never claims a device is verified. */
export const unavailableVerifier: IntegrityVerifier = {
  platform: 'android',
  async verify() {
    return 'unverified';
  },
};
