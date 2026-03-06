'use client';

import { Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useTransition } from 'react';

export default function CompanySearchBar({ initialQuery }: { initialQuery: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const inputRef = useRef<HTMLInputElement>(null);

    function handleSearch(value: string) {
        const params = new URLSearchParams(searchParams.toString());
        if (value.trim()) {
            params.set('q', value.trim());
        } else {
            params.delete('q');
        }
        params.delete('page'); // reset to page 1 on new search
        startTransition(() => {
            router.push(`/companies?${params.toString()}`);
        });
    }

    function handleClear() {
        if (inputRef.current) inputRef.current.value = '';
        handleSearch('');
    }

    return (
        <div className="relative max-w-xl mx-auto">
            <div className={`flex items-center bg-[var(--card)] border ${isPending ? 'border-brand-400' : 'border-[var(--border)]'} rounded-2xl shadow-sm px-4 py-3 gap-3 transition-colors focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100`}>
                <Search className={`w-5 h-5 shrink-0 transition-colors ${isPending ? 'text-brand-500' : 'text-slate-400'}`} />
                <input
                    ref={inputRef}
                    type="text"
                    defaultValue={initialQuery}
                    placeholder="Search companies..."
                    className="flex-1 bg-transparent border-none outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400 text-sm"
                    onChange={(e) => {
                        const val = e.target.value;
                        // Debounce: only search after user pauses typing 300ms
                        clearTimeout((window as any).__companySearchTimer);
                        (window as any).__companySearchTimer = setTimeout(() => {
                            handleSearch(val);
                        }, 300);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            clearTimeout((window as any).__companySearchTimer);
                            handleSearch((e.target as HTMLInputElement).value);
                        }
                    }}
                />
                {initialQuery && (
                    <button onClick={handleClear} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>
            {isPending && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                </div>
            )}
        </div>
    );
}
