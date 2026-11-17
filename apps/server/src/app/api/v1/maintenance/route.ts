import { NextResponse } from 'next/server';
import { route } from '@/server/http';
import { MAINTENANCE_TEXT, readMaintenance } from '@/server/maintenance';

export const dynamic = 'force-dynamic';

/** D246: public. The app asks while its maintenance screen is showing, to know when it's over. */
export const GET = route(async () => {
  const state = await readMaintenance();
  return NextResponse.json(
    { on: state.on, text: MAINTENANCE_TEXT, message: state.message },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
