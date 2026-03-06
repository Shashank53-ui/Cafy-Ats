'use client';

import { useState } from 'react';
import { Database, Briefcase, MapPin, Building, ChevronRight } from 'lucide-react';
import { getJobs, Job } from '../app/actions/jobActions';

interface JobFeedProps {
    initialJobs: Job[];
    initialTotalPages: number;
    searchParams: {
        q?: string;
        loc?: string;
        tier2?: string;
        locs?: string | string[];
        userPrefs?: any;
    };
}

// Fix known bad URL patterns (SmartRecruiters API URL -> public page)
function fixJobUrl(url: string): string {
    if (!url) return '#';
    if (url.includes('api.smartrecruiters.com')) {
        const match = url.match(/\/companies\/([^/]+)\/postings\/([^/?#]+)/);
        if (match) return `https://jobs.smartrecruiters.com/${match[1]}/${match[2]}`;
    }
    return url;
}

export default function JobFeed({ initialJobs, initialTotalPages, searchParams }: JobFeedProps) {
    const [jobs, setJobs] = useState<Job[]>(initialJobs);
    const [page, setPage] = useState(1);
    const [isFetching, setIsFetching] = useState(false);

    // Track seen IDs to avoid duplicates and ensure diversity across "Load More"
    const [seenJobIds, setSeenJobIds] = useState<string[]>(initialJobs.map(j => j.id));
    const [seenCompanyIds, setSeenCompanyIds] = useState<number[]>(initialJobs.map(j => j.company_id));

    const totalPages = initialTotalPages;

    const loadMore = async () => {
        setIsFetching(true);

        // Artificial 1-second delay for UX as requested
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
            const nextPage = page + 1;
            const data = await getJobs({
                ...searchParams,
                page: nextPage,
                excludedJobIds: seenJobIds,
                excludedCompanyIds: seenCompanyIds
            });

            if (data && data.jobs) {
                const newJobs = data.jobs as Job[];
                setJobs(prev => [...prev, ...newJobs]);
                setSeenJobIds(prev => [...prev, ...newJobs.map(j => j.id)]);
                setSeenCompanyIds(prev => [...prev, ...newJobs.map(j => j.company_id)]);
                setPage(nextPage);
            }
        } catch (error) {
            console.error('Error fetching more jobs:', error);
        } finally {
            setIsFetching(false);
        }
    };

    if (jobs.length === 0) {
        return (
            <div className="text-center py-20 bg-[var(--card)] rounded-none border border-dashed border-[var(--border)]">
                <Database className="w-10 h-10 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 dark:text-white">No jobs found</h3>
                <p className="text-slate-500 mt-1">Try adjusting your filters or search terms.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {jobs.map((job) => (
                <a
                    key={job.id}
                    href={fixJobUrl(job.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-[var(--card)] border border-[var(--border)] p-6 rounded-none hover-card-lift relative overflow-hidden group"
                >
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-none border border-[var(--border)] overflow-hidden bg-slate-50 flex items-center justify-center shrink-0">
                            {job.company?.url_favicon ? (
                                <img src={job.company.url_favicon} alt="logo" className="w-8 h-8 object-contain" />
                            ) : (
                                <Building className="w-6 h-6 text-slate-400" />
                            )}
                        </div>

                        <div className="flex-1">
                            <h3 className="font-semibold text-lg text-slate-900 dark:text-white group-hover:text-brand-600 transition-colors">
                                {job.title}
                            </h3>
                            <p className="text-slate-500 text-sm mt-1">{job.company?.companies_house_name || job.company?.trading_name || 'Verified Sponsor'}</p>

                            <div className="flex items-center gap-4 mt-4 flex-wrap">
                                <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 px-2.5 py-1 rounded-md font-medium">
                                    <MapPin className="w-3.5 h-3.5" />
                                    {job.location}
                                </div>

                                {job.department && (
                                    <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 px-2.5 py-1 rounded-md font-medium">
                                        <Briefcase className="w-3.5 h-3.5" />
                                        {job.department}
                                    </div>
                                )}

                                {job.company?.licensed_sponsor && (
                                    <div className="flex items-center gap-1.5 text-xs text-brand-700 bg-brand-50 dark:bg-brand-900/30 dark:text-brand-300 px-2.5 py-1 rounded-md font-medium border border-brand-200 dark:border-brand-800">
                                        Verified Sponsor
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="bg-brand-50 text-brand-600 p-2 rounded-full">
                                <ChevronRight className="w-5 h-5" />
                            </div>
                        </div>
                    </div>
                </a>
            ))}

            {/* Load More Button */}
            {page < totalPages && (
                <div className="flex items-center justify-center pt-8">
                    <button
                        onClick={loadMore}
                        disabled={isFetching}
                        className="inline-flex items-center justify-center px-8 py-3 bg-[var(--card)] border border-[var(--border)] hover:border-brand-400 text-brand-600 font-semibold transition-all hover-card-lift min-w-[200px] disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isFetching ? (
                            <span className="flex items-center gap-2">
                                <span className="animate-pulse">Fetching...</span>
                            </span>
                        ) : (
                            <>
                                Load More Jobs
                                <ChevronRight className="w-4 h-4 ml-2" />
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
