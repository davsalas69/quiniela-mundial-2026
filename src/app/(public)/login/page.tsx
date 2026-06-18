'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/?showAuth=true&mode=login');
  }, [router]);

  return (
    <div className="min-h-screen bg-[#07070b] flex items-center justify-center">
      <div className="text-zinc-500 font-bold text-sm uppercase tracking-widest animate-pulse">
        Cargando acceso...
      </div>
    </div>
  );
}
