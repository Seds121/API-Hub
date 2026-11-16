'use client';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '../ui/button';

export function HeroSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      className="mx-auto flex w-full max-w-xl items-center gap-2 rounded-xl border border-white/15 bg-white/10 p-1.5 shadow-2xl backdrop-blur"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/marketplace${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      }}
    >
      <Search className="ml-2 h-5 w-5 text-slate-300" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search APIs — e.g. email verification, social profiles…" className="h-10 flex-1 bg-transparent text-sm text-white placeholder:text-slate-400 focus:outline-none" aria-label="Search APIs" />
      <Button type="submit" className="bg-white text-navy-900 hover:bg-white/90">
        Search
      </Button>
    </form>
  );
}
