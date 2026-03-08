'use client';

import { useSearchParams } from 'next/navigation';
import { Search, MapPin } from 'lucide-react';

export default function SearchBar() {
    const searchParams = useSearchParams();

    return (
        <form action="/jobs" method="GET" className="w-full flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                    type="text"
                    name="q"
                    key={`q-${searchParams.get('q')}`}
                    defaultValue={searchParams.get('q') || ''}
                    placeholder="Role, keyword, or company..."
                    className="w-full pl-9 pr-4 py-2.5 text-sm border border-[var(--border)] rounded-md bg-white focus:outline-none focus:border-[#0066FF] focus:ring-1 focus:ring-[#0066FF] text-slate-700 placeholder-slate-400 transition-colors"
                />
            </div>

            <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                    type="text"
                    name="loc"
                    key={`loc-${searchParams.get('loc')}`}
                    defaultValue={searchParams.get('loc') || ''}
                    placeholder="Location (e.g., London)"
                    className="w-full pl-9 pr-4 py-2.5 text-sm border border-[var(--border)] rounded-md bg-white focus:outline-none focus:border-[#0066FF] focus:ring-1 focus:ring-[#0066FF] text-slate-700 placeholder-slate-400 transition-colors"
                />
            </div>

            {/* Preserving other params if they exist */}
            {searchParams.get('tier2') === 'true' && <input type="hidden" name="tier2" value="true" />}

            <button
                type="submit"
                className="bg-[#0066FF] hover:bg-[#0052CC] text-white px-8 py-2.5 rounded-md font-semibold text-sm transition-colors shadow-sm"
            >
                Search
            </button>
        </form>
    );
}
