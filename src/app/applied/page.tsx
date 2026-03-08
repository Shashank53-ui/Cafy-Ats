import Link from 'next/link';
import { Database, Briefcase, MapPin, Building, ChevronRight, Check } from 'lucide-react';
import { getAppliedJobs } from '../actions/jobActions';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import Logo from '@/components/Logo';

// Apply the same jobUrl fix as JobFeed
function fixJobUrl(url: string): string {
    if (!url) return '#';
    if (url.includes('api.smartrecruiters.com')) {
        const match = url.match(/\/companies\/([^/]+)\/postings\/([^/?#]+)/);
        if (match) return `https://jobs.smartrecruiters.com/${match[1]}/${match[2]}`;
    }
    return url;
}

export default async function AppliedJobsPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    const { jobs, success, error } = await getAppliedJobs();

    return (
        <div className="min-h-screen bg-[var(--background)]">

            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-32">
                <div className="mb-8 pl-4 lg:pl-0">
                    <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">Tracked Applications</h1>
                    <p className="text-slate-500">Jobs you have marked as applied to keep track of your sponsorships journey.</p>
                </div>

                {!success ? (
                    <div className="text-center py-20 bg-[var(--card)] rounded-md border border-red-200">
                        <p className="text-red-500">Error loading applied jobs: {error}</p>
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="text-center py-20 bg-[var(--card)] rounded-md border border-dashed border-[var(--border)]">
                        <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-200">You haven't tracked any applications yet</h3>
                        <p className="text-slate-500 mt-2 mb-6">When you find a job you like, click "Mark as applied" to save it here.</p>
                        <Link href="/jobs" className="inline-flex items-center justify-center px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-md transition-colors shadow-sm">
                            Browse Jobs <ChevronRight className="w-4 h-4 ml-1" />
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {jobs.filter(j => j !== null).map((job) => (
                            <div key={job!.id} className="bg-white border border-[var(--border)] rounded-md p-5 flex flex-col hover:border-brand-300 transition-colors shadow-sm">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-md border border-[var(--border)] bg-white flex items-center justify-center shrink-0">
                                        {job!.company?.url_favicon ? (
                                            <img src={job!.company.url_favicon} alt="logo" className="w-6 h-6 object-contain" />
                                        ) : (
                                            <Building className="w-6 h-6 text-slate-400" />
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900 leading-tight">{job!.company?.trading_name}</h3>
                                        {job!.company?.companies_house_name && job!.company.companies_house_name !== job!.company.trading_name && (
                                            <p className="text-[11px] text-slate-500 leading-none mt-0.5">{job!.company.companies_house_name}</p>
                                        )}
                                    </div>
                                </div>

                                <h4 className="font-bold text-[16px] text-slate-900 mb-2 leading-snug">{job!.title}</h4>

                                <div className="flex items-center gap-2 text-[13px] text-slate-500 mb-4 font-medium flex-wrap">
                                    <span>{job!.department || 'Engineering'}</span>
                                    <span>•</span>
                                    <span>{job!.location || 'UK'}</span>
                                </div>

                                <div className="mt-auto pt-4 border-t border-[var(--border)]">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Applied</span>
                                        <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-sm">
                                            {job!.applied_at ? new Date(job!.applied_at).toLocaleDateString('en-GB') : 'Unknown'}
                                        </span>
                                    </div>
                                    <a
                                        href={fixJobUrl(job!.url)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full bg-[#137cdb] hover:bg-blue-600 text-white text-center py-2.5 rounded-sm font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
                                    >
                                        View Original Posting
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
