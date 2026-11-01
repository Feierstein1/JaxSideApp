import { NextResponse } from 'next/server';
import { accountView, requireBusiness } from '@/server/auth';
import { route } from '@/server/http';

export const GET = route(async (req) => {
  const { account } = await requireBusiness(req, { allowPasswordChange: true });
  return NextResponse.json({ account: accountView(account) });
});
