import Landing from '@/components/Landing';
import { redisConfigured } from '@/lib/redis';
import { randomName } from '@/lib/names';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const configured = redisConfigured() && Boolean(process.env.SESSION_SECRET);
  return <Landing configured={configured} suggestion={randomName()} />;
}
