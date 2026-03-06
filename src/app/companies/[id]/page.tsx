import { Building, MapPin, Briefcase, Users, CheckCircle, ArrowLeft, ExternalLink, Globe, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import Logo from '../../../components/Logo';

export const dynamic = 'force-dynamic';

// Helper to fix known bad job URL patterns
function fixJobUrl(url: string, atsProvider: string | null): string {
    if (!url) return '#';

    // Fix SmartRecruiters API URLs -> public job page
    // e.g. https://api.smartrecruiters.com/v1/companies/esuregroup/postings/744000111350535
    // -> https://jobs.smartrecruiters.com/esuregroup/744000111350535
    if (url.includes('api.smartrecruiters.com')) {
        const match = url.match(/\/companies\/([^/]+)\/postings\/([^/?#]+)/);
        if (match) {
            return `https://jobs.smartrecruiters.com/${match[1]}/${match[2]}`;
        }
    }

    return url;
}

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const companyId = parseInt(id);
    if (isNaN(companyId)) notFound();

    const [{ data: company }, { data: jobs }] = await Promise.all([
        supabase
            .from('companies')
            .select('*')
            .eq('id', companyId)
            .single(),
        supabase
            .from('jobs')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false }),
    ]);

    if (!company) notFound();

    const jobList = jobs || [];

    return (
        <div className="min-h-screen bg-[var(--background)]">
            {/* Navigation */}
            <nav className="fixed top-0 w-full z-50 glass border-b border-[var(--border)]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2">
                        <div className="text-brand-600">
                            <Logo className="w-8 h-8" />
                        </div>
                        <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-600 to-purple-600 dark:from-brand-400 dark:to-purple-400">
                            Getlanded
                        </span>
                    </Link>
                    <div className="flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
                        <Link href="/" className="hover:text-brand-600 transition-colors">Jobs</Link>
                        <Link href="/companies" className="hover:text-brand-600 transition-colors">Companies</Link>
                        <button className="bg-brand-600 hover:bg-brand-500 text-white px-5 py-2 rounded-full transition-colors shadow-sm font-medium">Sign in</button>
                    </div>
                </div>
            </nav>

            <main className="pt-24 pb-16 px-4 max-w-5xl mx-auto">
                {/* Back */}
                <Link href="/companies" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-brand-600 transition-colors mb-8 group">
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Back to Companies
                </Link>

                {/* Company Header */}
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-3xl p-8 mb-8">
                    <div className="flex items-start gap-6">
                        <div className="w-20 h-20 rounded-2xl border border-[var(--border)] overflow-hidden bg-white flex items-center justify-center shrink-0 shadow-sm">
                            {company.url_favicon ? (
                                <img src={company.url_favicon} alt={company.trading_name} className="w-14 h-14 object-contain" />
                            ) : (
                                <Building className="w-10 h-10 text-slate-400" />
                            )}
                        </div>

                        <div className="flex-1">
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                                <div>
                                    <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">{company.trading_name}</h1>
                                    {company.companies_house_name && (
                                        <p className="text-sm text-slate-500 uppercase tracking-wider mt-1">
                                            {company.companies_house_name}
                                        </p>
                                    )}
                                    {company.estimated_num_employees_label && (
                                        <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-2">
                                            <Users className="w-4 h-4" />
                                            {company.estimated_num_employees_label}
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-3 flex-wrap">
                                    {company.licensed_sponsor && (
                                        <div className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-full border border-emerald-200 dark:border-emerald-800 font-medium">
                                            <CheckCircle className="w-4 h-4" />
                                            Visa Sponsor
                                        </div>
                                    )}
                                    {company.url && (
                                        <a
                                            href={company.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300 bg-[var(--background)] px-3 py-1.5 rounded-full border border-[var(--border)] hover:border-brand-400 hover:text-brand-600 transition-colors"
                                        >
                                            <Globe className="w-4 h-4" />
                                            Website
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                    )}
                                </div>
                            </div>

                            {company.description && (
                                <p className="text-slate-500 dark:text-slate-400 mt-4 leading-relaxed text-sm max-w-3xl">
                                    {company.description}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Jobs List */}
                <div>
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Briefcase className="w-5 h-5 text-brand-600" />
                        Open Roles
                        <span className="ml-1 text-sm font-normal text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                            {jobList.length}
                        </span>
                    </h2>

                    {jobList.length === 0 ? (
                        <div className="text-center py-20 bg-[var(--card)] rounded-3xl border border-dashed border-[var(--border)]">
                            <Briefcase className="w-10 h-10 text-slate-300 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-slate-900 dark:text-white">No open roles right now</h3>
                            <p className="text-slate-500 mt-1 text-sm">Check back later or visit their website directly.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {jobList.map((job: any) => {
                                const applyUrl = fixJobUrl(job.url, company.ats_provider);
                                return (
                                    <a
                                        key={job.id}
                                        href={applyUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group flex items-center justify-between bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 hover-card-lift"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-brand-600 transition-colors">
                                                {job.title}
                                            </h3>
                                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                                                {job.location && (
                                                    <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 px-2.5 py-1 rounded-md font-medium">
                                                        <MapPin className="w-3.5 h-3.5" />
                                                        {job.location}
                                                    </div>
                                                )}
                                                {job.department && (
                                                    <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 px-2.5 py-1 rounded-md font-medium">
                                                        <Briefcase className="w-3.5 h-3.5" />
                                                        {job.department}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="ml-4 flex items-center gap-2 shrink-0">
                                            <span className="hidden sm:block text-sm font-medium text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                                Apply
                                            </span>
                                            <div className="bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 p-2 rounded-full group-hover:bg-brand-100 transition-colors">
                                                <ExternalLink className="w-4 h-4" />
                                            </div>
                                        </div>
                                    </a>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
