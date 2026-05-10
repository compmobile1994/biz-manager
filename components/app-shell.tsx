'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard,
  FileText,
  Users,
  Package,
  Receipt,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ServiceWorkerRegister } from './service-worker-register';

const NAV = [
  { href: '/', label: 'מסך הבית', icon: LayoutDashboard },
  { href: '/documents', label: 'מסמכים', icon: FileText },
  { href: '/customers', label: 'לקוחות', icon: Users },
  { href: '/saved-items', label: 'פריטים שמורים', icon: Package },
  { href: '/expenses', label: 'הוצאות', icon: Receipt },
  { href: '/reports', label: 'דוחות / רואה חשבון', icon: BarChart3 },
  { href: '/settings', label: 'הגדרות', icon: Settings },
];

export function AppShell({ children, userEmail }: { children: React.ReactNode; userEmail?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-muted/30">
      <ServiceWorkerRegister />
      {/* Sidebar - desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-card border-l shrink-0">
        <div className="p-5 border-b">
          <Link href="/" className="font-bold text-lg block">
            ניהול עסק
          </Link>
          {userEmail && <p className="text-xs text-muted-foreground mt-1 truncate">{userEmail}</p>}
        </div>
        <nav className="flex-1 p-3 flex flex-col gap-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t">
          <Link href="/documents/new" className="block mb-2">
            <Button className="w-full" size="sm">
              <Plus className="h-4 w-4" />
              מסמך חדש
            </Button>
          </Link>
          <form action="/api/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
              <LogOut className="h-4 w-4" />
              יציאה
            </Button>
          </form>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-card border-b flex items-center justify-between px-4 h-14">
        <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)}>
          <Menu className="h-5 w-5" />
        </Button>
        <span className="font-bold">ניהול עסק</span>
        <Link href="/documents/new">
          <Button size="icon" variant="ghost">
            <Plus className="h-5 w-5" />
          </Button>
        </Link>
      </div>

      {/* Mobile sidebar drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setOpen(false)}>
          <aside
            className="absolute right-0 top-0 bottom-0 w-72 bg-card flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b">
              <span className="font-bold text-lg">ניהול עסק</span>
              {userEmail && <p className="text-xs text-muted-foreground mt-1 truncate">{userEmail}</p>}
            </div>
            <nav className="flex-1 p-3 flex flex-col gap-1">
              {NAV.map((item) => {
                const Icon = item.icon;
                const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm',
                      active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="p-3 border-t">
              <form action="/api/auth/signout" method="post">
                <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
                  <LogOut className="h-4 w-4" />
                  יציאה
                </Button>
              </form>
            </div>
          </aside>
        </div>
      )}

      <main className="flex-1 mt-14 md:mt-0 p-4 md:p-8 overflow-x-hidden">{children}</main>
    </div>
  );
}
