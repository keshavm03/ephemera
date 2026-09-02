import { json, fail, handleRouteError } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/giphy?q=...  — a thin proxy.
 *
 * The key stays on the server (a NEXT_PUBLIC_ key would be world-readable in
 * the bundle), and the response is reduced to the handful of fields the
 * composer actually renders.
 */
export async function GET(req: Request) {
  try {
    const key = process.env.GIPHY_API_KEY;
    if (!key) return json({ enabled: false, gifs: [] });

    const url = new URL(req.url);
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 60);
    const limit = 24;

    const endpoint = q
      ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(q)}&limit=${limit}&rating=pg-13&bundle=messaging_non_clips`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=${limit}&rating=pg-13&bundle=messaging_non_clips`;

    const res = await fetch(endpoint, { cache: 'no-store' });
    if (!res.ok) return fail('GIF search is unavailable right now', 502);

    const payload = (await res.json()) as {
      data?: Array<{
        id: string;
        title?: string;
        images?: {
          fixed_width?: { url?: string; width?: string; height?: string };
          fixed_width_downsampled?: { url?: string };
        };
      }>;
    };

    const gifs = (payload.data ?? [])
      .map((g) => ({
        id: g.id,
        title: g.title ?? '',
        url: g.images?.fixed_width?.url ?? '',
        preview: g.images?.fixed_width_downsampled?.url ?? g.images?.fixed_width?.url ?? '',
        w: Number(g.images?.fixed_width?.width) || undefined,
        h: Number(g.images?.fixed_width?.height) || undefined,
      }))
      // Giphy urls carry tracking query strings; drop them before they are
      // pinned into a message that other people will load.
      .map((g) => ({ ...g, url: g.url.split('?')[0], preview: g.preview.split('?')[0] }))
      .filter((g) => g.url);

    return json({ enabled: true, gifs });
  } catch (err) {
    return handleRouteError(err);
  }
}
