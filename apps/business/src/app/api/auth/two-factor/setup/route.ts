import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { requireBusiness, startTwoFactorSetup } from '@/server/auth';
import { route } from '@/server/http';

/** Optional two-step sign-in: a new secret to scan (on only after a code confirms it). */
export const POST = route(async (req) => {
  const { account } = await requireBusiness(req);
  const setup = await startTwoFactorSetup(account);
  return NextResponse.json({
    ...setup,
    qrSvg: await QRCode.toString(setup.otpauthUrl, { type: 'svg', margin: 1 }),
  });
});
