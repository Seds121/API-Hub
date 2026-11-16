import { Logo } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { COMPANY } from '@/lib/utils';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col p-6 lg:p-10">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-navy-950 lg:block">
        <div className="bg-grid absolute inset-0 opacity-10" />
        <div className="absolute -bottom-32 -right-32 h-[420px] w-[420px] rounded-full bg-blue-600/40 blur-3xl" />
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <blockquote className="max-w-md space-y-3">
            <p className="text-2xl font-medium leading-snug">“We replaced eleven supplier contracts with one key and one invoice — and our clients get their own sub-accounts.”</p>
            <footer className="text-sm text-slate-400">Illustrative agency use case · {COMPANY}</footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}
