'use client';

import { useTransition, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function JobFilters() {
    const router = useRouter();
    const searchParams = useSearchParams();
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
            router.push(`/?${params.toString()}`);
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
        <aside className={`lg:col-span-1 border border-[var(--border)] rounded-3xl p-6 bg-[var(--card)] shadow-sm h-fit sticky top-24 transition-opacity ${isPending ? 'opacity-50' : 'opacity-100'}`}>
            <h3 className="font-semibold text-lg mb-4">Filters</h3>

            <div className="space-y-6">
                <div>
                    <h4 className="text-sm font-medium text-slate-500 mb-3">Visa Sponsorship</h4>
                    <label className="flex items-center gap-3 cursor-pointer group" onClick={(e) => { e.preventDefault(); handleTier2(); }}>
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${tier2 ? 'bg-brand-500 border-brand-500' : 'border-slate-300 group-hover:border-brand-500'}`}>
                            {tier2 && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <span className="text-sm">Tier 2 Sponsor List (UK)</span>
                    </label>
                </div>

                <div>
                    <h4 className="text-sm font-medium text-slate-500 mb-3">Job Location</h4>
                    <div className="space-y-3 text-sm">
                        {['London', 'Remote', 'Manchester', 'Edinburgh', 'Cambridge', 'Bristol'].map(loc => (
                            <label key={loc} className="flex items-center gap-3 cursor-pointer group">
                                <div className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${locations.includes(loc) ? 'bg-brand-500 border-brand-500' : 'border-slate-300 group-hover:border-brand-500'}`}>
                                    {locations.includes(loc) && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                                </div>
                                <input type="checkbox" className="hidden" checked={locations.includes(loc)} onChange={() => handleLocation(loc)} /> {loc}
                            </label>
                        ))}
                    </div>
                </div>
            </div>
        </aside>
    );
}
