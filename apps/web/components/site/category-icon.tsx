import { Bot, Building2, Lock, MapPin, MessageSquare, Share2, ShieldCheck, Boxes } from 'lucide-react';

const ICONS: Record<string, React.ElementType> = { 'social-media': Share2, ai: Bot, communication: MessageSquare, identity: ShieldCheck, 'business-data': Building2, geolocation: MapPin, security: Lock };

export function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  const I = ICONS[slug] ?? Boxes;
  return <I className={className} />;
}
