import { NextResponse } from 'next/server';
import { requireBusiness } from '@/server/auth';
import { route } from '@/server/http';

export const GET = route(async (req) => {
  const { account } = await requireBusiness(req);
  return NextResponse.json({
    account: {
      id: account.id,
      email: account.email,
      mustChangePassword: account.mustChangePassword,
    },
  });
});
