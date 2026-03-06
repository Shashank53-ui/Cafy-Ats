'use client';

import { useTransition, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, MapPin } from 'lucide-react';

export default function SearchBar() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const [q, setQ] = useState(searchParams.get('q') || '');
    const [loc, setLoc] = useState(searchParams.get('loc') || '');

    // Keep state synced with URL if user navigates back/forward
    useEffect(() => {
        setQ(searchParams.get('q') || '');
        setLoc(searchParams.get('loc') || '');
    }, [searchParams]);

    const handleSearch = () => {
        const params = new URLSearchParams(searchParams.toString());

        if (q) params.set('q', q);
        else params.delete('q');

        if (loc) params.set('loc', loc);
        else params.delete('loc');

        params.set('page', '1'); // Reset to page 1 on search

        startTransition(() => {
            router.push(`/?${params.toString()}`);
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    return (
        <div className="max-w-3xl mx-auto bg-[var(--card)] p-2 rounded-full shadow-lg border border-[var(--border)] flex items-center transition-all focus-within:ring-2 focus-within:ring-brand-500/50">
            <div className="flex-1 flex items-center pl-4">
                <Search className="w-5 h-5 text-slate-400" />
                <input
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Job title, keywords, or company..."
                    className="w-full bg-transparent border-none outline-none focus:ring-0 px-4 py-3 text-slate-900 dark:text-slate-100"
                />
            </div>
            <div className="w-[1px] h-8 bg-[var(--border)] mx-2"></div>
            <div className="flex-1 flex items-center pl-4">
                <MapPin className="w-5 h-5 text-slate-400" />
                <input
                    type="text"
                    value={loc}
                    onChange={(e) => setLoc(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="City (e.g., London)"
                    className="w-full bg-transparent border-none outline-none focus:ring-0 px-4 py-3 text-slate-900 dark:text-slate-100"
                />
            </div>
            <button
                onClick={handleSearch}
                disabled={isPending}
                className="bg-brand-600 hover:bg-brand-500 disabled:opacity-70 text-white px-8 py-3 rounded-full font-medium transition-colors ml-2 flex items-center gap-2"
            >
                {isPending ? (
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                ) : (
                    'Search'
                )}
            </button>
        </div>
    );
}
