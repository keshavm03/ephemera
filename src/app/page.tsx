import Landing from '@/components/Landing';
import { redisConfigured } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const configured = redisConfigured() && Boolean(process.env.SESSION_SECRET);
  return <Landing configured={configured} />;
}
