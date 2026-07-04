import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = process.env.BLOB_READ_WRITE_TOKEN ?? '';
  const isVercel = !!process.env.VERCEL;
  const m = token.match(/^vercel_blob_rw_([^_]+)_/);
  const storeId = m?.[1] ?? 'NO_MATCH';
  const derivedUrl = m
    ? `https://${storeId.toLowerCase()}.private.blob.vercel-storage.com/agentguild-db/agentguild.db`
    : 'CANNOT_DERIVE';

  let fetchStatus = 0;
  let blobSize = 0;
  if (derivedUrl !== 'CANNOT_DERIVE') {
    try {
      const r = await fetch(derivedUrl, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      fetchStatus = r.status;
      if (r.ok) blobSize = (await r.arrayBuffer()).byteLength;
    } catch { fetchStatus = -1; }
  }

  return NextResponse.json({
    isVercel,
    tokenPrefix: token.slice(0, 32) + '...',
    storeId,
    derivedUrl,
    fetchStatus,
    blobSize,
  });
}
