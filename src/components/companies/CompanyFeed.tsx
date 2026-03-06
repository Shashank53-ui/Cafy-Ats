'use client';

import { useState, useEffect } from 'react';
import { Building, Users, ChevronRight, Globe, Linkedin, ArrowUpRight, ChevronLeft, MapPin, Briefcase, X } from 'lucide-react';
import Link from 'next/link';
import { getCompanies, Company } from '../../app/actions/companyActions';
import { getJobs, Job } from '../../app/actions/jobActions';

interface CompanyFeedProps {
    initialCompanies: Company[];
    initialTotalPages: number;
    searchParams: {
        q?: string;
    };
}

export default function CompanyFeed({ initialCompanies, initialTotalPages, searchParams }: CompanyFeedProps) {
    const [companies, setCompanies] = useState<Company[]>(initialCompanies);
    const [page, setPage] = useState(1);
    const [isFetchingCompanies, setIsFetchingCompanies] = useState(false);

    // Side Panel State
    const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(
        initialCompanies.length > 0 ? initialCompanies[0].id : null
    );
    const [isDescExpanded, setIsDescExpanded] = useState(false);

    // View State: 'details' or 'roles'
    const [viewState, setViewState] = useState<'details' | 'roles'>('details');
    const [companyJobs, setCompanyJobs] = useState<Job[]>([]);
    const [companyJobsPage, setCompanyJobsPage] = useState(1);
    const [companyJobsTotalPages, setCompanyJobsTotalPages] = useState(0);
    const [isFetchingJobs, setIsFetchingJobs] = useState(false);

    // Track seen IDs to avoid duplicates for Companies
    const [seenCompanyIds, setSeenCompanyIds] = useState<number[]>(initialCompanies.map(c => c.id));
    const totalPages = initialTotalPages;

    useEffect(() => {
        setIsDescExpanded(false);
        setViewState('details');
    }, [selectedCompanyId]);

    // Sync state when props change (e.g., after a search)
    useEffect(() => {
        setCompanies(initialCompanies);
        setPage(1);
        setSeenCompanyIds(initialCompanies.map(c => c.id));
        if (initialCompanies.length > 0) {
            setSelectedCompanyId(initialCompanies[0].id);
        } else {
            setSelectedCompanyId(null);
        }
    }, [initialCompanies]);

    const selectedCompany = companies.find(c => c.id === selectedCompanyId);

    const loadMoreCompanies = async () => {
        setIsFetchingCompanies(true);
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
            const nextPage = page + 1;
            const data = await getCompanies({
                ...searchParams,
                page: nextPage,
                excludedCompanyIds: seenCompanyIds
            });

            if (data && data.companies) {
                const newCompanies = data.companies as Company[];
                setCompanies(prev => [...prev, ...newCompanies]);
                setSeenCompanyIds(prev => [...prev, ...newCompanies.map(c => c.id)]);
                setPage(nextPage);
            }
        } catch (error) {
            console.error('Error fetching more companies:', error);
        } finally {
            setIsFetchingCompanies(false);
        }
    };

    const handleViewRoles = async () => {
        if (!selectedCompanyId) return;
        setViewState('roles');
        setIsFetchingJobs(true);
        setCompanyJobsPage(1);
        try {
            // Using the existing getJobs action
            const data = await getJobs({
                company_id: selectedCompanyId,
                page: 1
            });
            if (data && data.jobs) {
                setCompanyJobs(data.jobs as Job[]);
                setCompanyJobsTotalPages(data.totalPages || 0);
            }
        } catch (error) {
            console.error('Error fetching jobs for company:', error);
        } finally {
            setIsFetchingJobs(false);
        }
    };

    const loadMoreCompanyJobs = async () => {
        if (!selectedCompanyId) return;
        setIsFetchingJobs(true);
        try {
            const nextPage = companyJobsPage + 1;
            const data = await getJobs({
                company_id: selectedCompanyId,
                page: nextPage
            });
            if (data && data.jobs) {
                setCompanyJobs(prev => [...prev, ...(data.jobs as Job[])]);
                setCompanyJobsPage(nextPage);
                setCompanyJobsTotalPages(data.totalPages || 0);
            }
        } catch (error) {
            console.error('Error fetching more jobs for company:', error);
        } finally {
            setIsFetchingJobs(false);
        }
    };

    if (companies.length === 0) {
        return (
            <div className="text-center py-20 bg-[var(--card)] rounded-none border border-dashed border-[var(--border)]">
                <Building className="w-10 h-10 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 dark:text-white">No companies found</h3>
                <p className="text-slate-500 mt-1">Try adjusting your search terms.</p>
            </div>
        );
    }

    // Fix URLs if using smartrecruiters API format
    const fixJobUrl = (url: string) => {
        if (!url) return '#';
        if (url.includes('api.smartrecruiters.com')) {
            const match = url.match(/\/companies\/([^/]+)\/postings\/([^/?#]+)/);
            if (match) return `https://jobs.smartrecruiters.com/${match[1]}/${match[2]}`;
        }
        return url;
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: List of Companies */}
            <div className="lg:col-span-2 space-y-4">
                {companies.map((company) => {
                    const isSelected = selectedCompanyId === company.id;
                    return (
                        <div
                            key={company.id}
                            onClick={() => setSelectedCompanyId(company.id)}
                            className={`block bg-[var(--card)] border p-6 rounded-none hover-card-lift relative overflow-hidden group cursor-pointer transition-all ${isSelected ? 'border-l-4 border-l-brand-600 border-t-[var(--border)] border-r-[var(--border)] border-b-[var(--border)]' : 'border-[var(--border)]'}`}
                        >
                            <div className="flex flex-col sm:flex-row items-start gap-5">
                                <div className="w-16 h-16 rounded-md border border-[var(--border)] overflow-hidden bg-slate-50 dark:bg-slate-900 flex items-center justify-center shrink-0">
                                    {company.url_favicon ? (
                                        <img src={company.url_favicon} alt="logo" className="w-10 h-10 object-contain" />
                                    ) : (
                                        <Building className="w-8 h-8 text-slate-400" />
                                    )}
                                </div>

                                <div className="flex-1">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div>
                                            <h3 className="font-semibold text-xl text-slate-900 dark:text-white group-hover:text-brand-600 transition-colors">
                                                {company.trading_name}
                                            </h3>
                                            <p className="text-slate-500 text-sm mt-1 uppercase tracking-wide">
                                                {company.companies_house_name || 'Verified Sponsor'}
                                            </p>
                                        </div>
                                    </div>

                                    {company.description && (
                                        <p className="text-slate-600 dark:text-slate-400 text-sm mt-4 line-clamp-2 leading-relaxed">
                                            {company.description}
                                        </p>
                                    )}

                                    <div className="flex items-center gap-3 mt-5 flex-wrap">
                                        {company.licensed_sponsor && (
                                            <div className="flex items-center gap-1.5 text-xs text-brand-700 bg-brand-50 dark:bg-brand-900/30 dark:text-brand-300 px-3 py-1.5 rounded-md font-medium border border-brand-200 dark:border-brand-800">
                                                Licensed Sponsor
                                            </div>
                                        )}
                                        {(company.active_jobs_count || 0) > 0 && (
                                            <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300 px-3 py-1.5 rounded-md font-medium border border-emerald-200 dark:border-emerald-800">
                                                {company.active_jobs_count} Open Job{(company.active_jobs_count !== 1) ? 's' : ''}
                                            </div>
                                        )}
                                        {company.estimated_num_employees_label && (
                                            <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 px-3 py-1.5 rounded-md font-medium">
                                                <Users className="w-3.5 h-3.5" />
                                                {company.estimated_num_employees_label}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Chevron for mobile or indicating selection */}
                            <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity lg:hidden">
                                <ChevronRight className="w-5 h-5 text-brand-500" />
                            </div>
                        </div>
                    );
                })}

                {/* Load More Button */}
                {page < totalPages && (
                    <div className="flex items-center justify-center pt-8">
                        <button
                            onClick={loadMoreCompanies}
                            disabled={isFetchingCompanies}
                            className="inline-flex items-center justify-center px-8 py-3 bg-[var(--card)] border border-[var(--border)] hover:border-brand-400 text-brand-600 font-semibold transition-all hover-card-lift min-w-[200px] disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isFetchingCompanies ? (
                                <span className="flex items-center gap-2">
                                    <span className="animate-pulse">Fetching...</span>
                                </span>
                            ) : (
                                <>
                                    Load More Companies
                                    <ChevronRight className="w-4 h-4 ml-2" />
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* Right Column: In-Page Detail Panel (Sticky) */}
            <div className="hidden lg:block lg:col-span-1">
                <div className="sticky top-24 bg-white dark:bg-slate-950 border border-[var(--border)] shadow-sm rounded-none overflow-hidden flex flex-col max-h-[calc(100vh-8rem)] min-h-[500px]">
                    {!selectedCompanyId || !selectedCompany ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-50">
                            <Building className="w-16 h-16 text-slate-300 mb-4" />
                            <h3 className="text-xl font-medium text-slate-800 dark:text-slate-200">Select a company</h3>
                            <p className="text-sm text-slate-500 mt-2">Click on a company from the list to view its details</p>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto w-full relative">
                            {viewState === 'details' ? (
                                <div className="p-8 animate-in fade-in slide-in-from-right-4 duration-300 h-full">
                                    {/* Header Layout */}
                                    <div className="flex items-start gap-5 mb-8">
                                        <div className="w-16 h-16 rounded-xl border border-[var(--border)] overflow-hidden bg-white dark:bg-slate-900 flex items-center justify-center shrink-0 shadow-sm">
                                            {selectedCompany.url_favicon ? (
                                                <img src={selectedCompany.url_favicon} alt="logo" className="w-10 h-10 object-contain" />
                                            ) : (
                                                <Building className="w-8 h-8 text-slate-300" />
                                            )}
                                        </div>
                                        <div className="flex-1 pt-1">
                                            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white leading-tight">
                                                {selectedCompany.trading_name}
                                            </h1>
                                            {selectedCompany.companies_house_name && (
                                                <p className="text-sm text-slate-500 font-medium mt-1 uppercase tracking-wide">
                                                    {selectedCompany.companies_house_name}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Links */}
                                    <div className="flex items-center gap-3 mb-8 border-b border-[var(--border)] pb-8">
                                        {selectedCompany.url && (
                                            <a
                                                href={selectedCompany.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-md text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                            >
                                                <Globe className="w-4 h-4" />
                                                Website
                                            </a>
                                        )}
                                        {selectedCompany.url_linkedin && (
                                            <a
                                                href={selectedCompany.url_linkedin}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-md text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                            >
                                                <Linkedin className="w-4 h-4" />
                                                LinkedIn
                                            </a>
                                        )}
                                    </div>

                                    {/* About Section */}
                                    <div className="mb-8">
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">About the company</h3>
                                        <div className="relative">
                                            <p className={`text-slate-600 dark:text-slate-400 leading-relaxed text-sm ${!isDescExpanded ? 'line-clamp-4' : ''}`}>
                                                {selectedCompany.description || `Explore opportunities at ${selectedCompany.trading_name}. We are always looking for talented individuals to join our growing team.`}
                                            </p>
                                            {(selectedCompany.description || '').length > 200 && (
                                                <button
                                                    onClick={() => setIsDescExpanded(!isDescExpanded)}
                                                    className="text-sm font-semibold text-slate-900 dark:text-white underline mt-2 hover:text-brand-600 transition-colors"
                                                >
                                                    {isDescExpanded ? 'Show less' : 'Show more'}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Open Roles Summary */}
                                    <div className="border-t border-[var(--border)] pt-8 mt-auto">
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Open roles</h3>
                                        <div className="mb-6">
                                            <div className="text-5xl font-black text-slate-900 dark:text-white mb-1">
                                                {selectedCompany.active_jobs_count || 0}
                                            </div>
                                            <p className="text-sm font-medium text-slate-500 italic">
                                                sponsored jobs available in the UK
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleViewRoles}
                                            className="w-full inline-flex items-center justify-center gap-2 bg-[var(--foreground)] hover:bg-slate-800 dark:bg-brand-600 dark:hover:bg-brand-700 text-[var(--background)] dark:text-white px-6 py-3 rounded-none font-bold transition-all shadow-sm group"
                                        >
                                            View open roles
                                            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-6 h-full flex flex-col bg-slate-50 dark:bg-slate-900/50 relative animate-in fade-in slide-in-from-left-4 duration-300">
                                    <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--border)]">
                                        <button
                                            onClick={() => setViewState('details')}
                                            className="p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md transition-colors"
                                        >
                                            <ChevronLeft className="w-5 h-5" />
                                        </button>
                                        <div>
                                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white leading-tight">
                                                Jobs at {selectedCompany.trading_name}
                                            </h2>
                                            <p className="text-xs text-slate-500 font-medium">{selectedCompany.active_jobs_count || 0} sponsored roles</p>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                                        {isFetchingJobs ? (
                                            <div className="flex items-center justify-center h-32">
                                                <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent flex rounded-full"></div>
                                            </div>
                                        ) : companyJobs.length === 0 ? (
                                            <div className="text-center py-12 text-slate-500">
                                                <Briefcase className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                                                <p>No sponsored roles currently found.</p>
                                            </div>
                                        ) : (
                                            <>
                                                {companyJobs.map(job => (
                                                    <a
                                                        key={job.id}
                                                        href={fixJobUrl(job.url)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="block bg-white dark:bg-slate-950 border border-[var(--border)] p-4 rounded-md hover-card-lift group"
                                                    >
                                                        <h4 className="font-semibold text-[15px] text-slate-900 dark:text-white group-hover:text-brand-600 transition-colors leading-tight mb-2">
                                                            {job.title}
                                                        </h4>
                                                        <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                                                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {job.location || 'UK'}</span>
                                                            {job.department && <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" /> {job.department}</span>}
                                                        </div>
                                                    </a>
                                                ))}
                                                {companyJobsPage < companyJobsTotalPages && (
                                                    <button
                                                        onClick={loadMoreCompanyJobs}
                                                        disabled={isFetchingJobs}
                                                        className="w-full mt-4 py-2 border border-[var(--border)] text-sm font-semibold text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                                                    >
                                                        {isFetchingJobs ? 'Loading...' : 'Load more roles'}
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Mobile View: Overlay Panel (Only visible on small screens when selected) */}
            {selectedCompanyId && (
                <div className="lg:hidden fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg bg-white dark:bg-slate-950 rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-8">
                        {/* Close Button Header */}
                        <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-slate-50 dark:bg-slate-900 shrink-0">
                            {viewState === 'roles' ? (
                                <button
                                    onClick={() => setViewState('details')}
                                    className="p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md flex items-center gap-1"
                                >
                                    <ChevronLeft className="w-5 h-5" /> Back
                                </button>
                            ) : (
                                <h2 className="font-semibold text-slate-900 dark:text-white">Company View</h2>
                            )}
                            <button onClick={() => setSelectedCompanyId(null)} className="p-1.5 bg-slate-200 dark:bg-slate-800 rounded-full">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            {viewState === 'details' ? (
                                <>
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-12 h-12 rounded-lg border border-[var(--border)] overflow-hidden bg-white flex items-center justify-center shrink-0">
                                            {selectedCompany?.url_favicon ? (
                                                <img src={selectedCompany.url_favicon} alt="logo" className="w-8 h-8 object-contain" />
                                            ) : (
                                                <Building className="w-6 h-6 text-slate-300" />
                                            )}
                                        </div>
                                        <div>
                                            <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
                                                {selectedCompany?.trading_name}
                                            </h1>
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-8">{selectedCompany?.description}</p>
                                    <button
                                        onClick={handleViewRoles}
                                        className="w-full flex justify-center py-3 bg-[var(--foreground)] text-[var(--background)] font-semibold rounded-md gap-2"
                                    >
                                        View open roles
                                        <ArrowUpRight className="w-4 h-4" />
                                    </button>
                                </>
                            ) : (
                                <div className="space-y-3">
                                    <div className="mb-4">
                                        <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                                            Jobs at {selectedCompany?.trading_name}
                                        </h2>
                                        <p className="text-xs text-slate-500 font-medium">{selectedCompany?.active_jobs_count || 0} sponsored roles</p>
                                    </div>
                                    {isFetchingJobs ? (
                                        <div className="flex items-center justify-center h-32">
                                            <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent flex rounded-full"></div>
                                        </div>
                                    ) : companyJobs.length === 0 ? (
                                        <div className="text-center py-8 text-slate-500">
                                            <Briefcase className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                                            <p>No sponsored roles currently found.</p>
                                        </div>
                                    ) : (
                                        <>
                                            {companyJobs.map(job => (
                                                <a
                                                    key={job.id}
                                                    href={fixJobUrl(job.url)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="block bg-slate-50 dark:bg-slate-900 border border-[var(--border)] p-4 rounded-md"
                                                >
                                                    <h4 className="font-semibold text-sm text-slate-900 dark:text-white mb-2 leading-tight">
                                                        {job.title}
                                                    </h4>
                                                    <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                                                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {job.location || 'UK'}</span>
                                                        {job.department && <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" /> {job.department}</span>}
                                                    </div>
                                                </a>
                                            ))}
                                            {companyJobsPage < companyJobsTotalPages && (
                                                <button
                                                    onClick={loadMoreCompanyJobs}
                                                    disabled={isFetchingJobs}
                                                    className="w-full mt-4 py-2 border border-[var(--border)] text-sm font-semibold text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                                                >
                                                    {isFetchingJobs ? 'Loading...' : 'Load more roles'}
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
