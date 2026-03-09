import React from 'react';

// Generates an animated badge depending on the ATS
export default function AtsBadge({ provider }: { provider?: string }) {
    if (!provider) return null;

    const map: Record<string, { label: string, color: string }> = {
        'workday_enterprise': { label: 'Workday', color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800' },
        'workday': { label: 'Workday', color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800' },
        'greenhouse': { label: 'Greenhouse', color: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800' },
        'ashby': { label: 'Ashby', color: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800' },
        'lever': { label: 'Lever', color: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800' },
        'workable': { label: 'Workable', color: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800' },
        'smartrecruiters': { label: 'SmartRecruiters', color: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800' },
        'teamtailor': { label: 'Teamtailor', color: 'bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800' },
        'bamboohr': { label: 'BambooHR', color: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800' },
        'pinpoint': { label: 'Pinpoint', color: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900/30 dark:text-fuchsia-300 dark:border-fuchsia-800' },
        'personio': { label: 'Personio', color: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800' },
        'firecrawl_ai': { label: 'AI Discovered', color: 'bg-slate-800 text-amber-300 border-slate-700' },
        'custom_site': { label: 'Custom Site', color: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' }
    };

    const badge = map[provider.toLowerCase()];
    if (!badge) return null;

    return (
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md font-medium border ${badge.color} relative overflow-hidden group/badge`}>
            {badge.label}
        </div>
    );
}
