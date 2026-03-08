'use client';

import { useTransition, useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ShieldCheck, MapPin, ChevronDown } from 'lucide-react';

export default function JobFilters() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const [isPending, startTransition] = useTransition();

    const [tier2, setTier2] = useState(searchParams.get('tier2') === 'true');
    const [locations, setLocations] = useState<string[]>(searchParams.getAll('locs') || []);

    useEffect(() => {
        setTier2(searchParams.get('tier2') === 'true');
        setLocations(searchParams.getAll('locs') || []);
    }, [searchParams]);

    const updateFilters = (newTier2: boolean, newLocs: string[]) => {
        const params = new URLSearchParams(searchParams.toString());

        if (newTier2) params.set('tier2', 'true');
        else params.delete('tier2');

        params.delete('locs');
        newLocs.forEach(l => params.append('locs', l));

        params.set('page', '1');

        startTransition(() => {
            router.push(`${pathname}?${params.toString()}`);
        });
    };

    const handleTier2 = () => {
        const next = !tier2;
        setTier2(next);
        updateFilters(next, locations);
    };

    const handleLocation = (loc: string) => {
        const next = locations.includes(loc)
            ? locations.filter(l => l !== loc)
            : [...locations, loc];
        setLocations(next);
        updateFilters(tier2, next);
    };

    return (
        <div className={`flex flex-wrap items-center justify-center gap-x-10 gap-y-4 py-6 px-4 transition-opacity ${isPending ? 'opacity-50' : 'opacity-100'}`}>

            {/* Visa Toggle */}
            <div className="flex items-center">
                <button
                    onClick={handleTier2}
                    className={`flex items-center gap-3 px-6 py-2.5 transition-all active:scale-95 group border ${tier2 ? 'bg-[#0066FF] border-[#0066FF] shadow-2xl shadow-[#0066FF]/20' : 'bg-white/40 border-slate-200 hover:border-[#0066FF]/40'}`}
                >
                    <ShieldCheck className={`w-4 h-4 ${tier2 ? 'text-white' : 'text-[#0066FF]'}`} />
                    <span className={`text-[11px] font-black uppercase tracking-[0.1em] ${tier2 ? 'text-white' : 'text-slate-600 group-hover:text-[#0066FF]'}`}>
                        Visa Sponsorship Only
                    </span>
                    <div className={`w-1.5 h-1.5 rounded-none ${tier2 ? 'bg-white' : 'bg-slate-200 group-hover:bg-[#0066FF]/30'}`}></div>
                </button>
            </div>

            <div className="hidden lg:block w-[1px] h-8 bg-slate-200/50"></div>

            {/* Location Quick Filters */}
            <div className="flex flex-wrap items-center justify-center gap-3">
                {['London', 'Remote', 'Manchester', 'Remote (UK)'].map(loc => {
                    const isSelected = locations.includes(loc);
                    return (
                        <button
                            key={loc}
                            onClick={() => handleLocation(loc)}
                            className={`px-5 py-2.5 border text-[10px] font-black uppercase tracking-[0.1em] transition-all active:scale-95 group flex items-center gap-2 ${isSelected
                                ? 'bg-[#111827] border-[#111827] text-white shadow-xl'
                                : 'bg-white/40 border-slate-200 text-slate-500 hover:border-[#0066FF] hover:text-[#0066FF]'}`}
                        >
                            <MapPin className={`w-3 h-3 ${isSelected ? 'text-[#0066FF]' : 'text-slate-300 group-hover:text-[#0066FF]'}`} />
                            {loc}
                        </button>
                    );
                })}
            </div>

            <div className="hidden xl:block w-[1px] h-8 bg-slate-200/50"></div>

            {/* Status Indicator */}
            <div className="hidden sm:flex items-center gap-3 px-4">
                <div className="relative">
                    <div className="w-1.5 h-1.5 bg-[#0066FF] rounded-none"></div>
                    <div className="absolute inset-0 w-1.5 h-1.5 bg-[#0066FF] rounded-none animate-ping opacity-40"></div>
                </div>
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                    Sponsor Database Live
                </span>
            </div>
        </div>
    );
}
