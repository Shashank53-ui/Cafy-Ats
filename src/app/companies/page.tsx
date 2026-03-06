import { Building, Briefcase, Users } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { createClient } from '../../utils/supabase/server';
import CompanySearchBar from './CompanySearchBar';
import CompanyFeed from '../../components/companies/CompanyFeed';
import { getCompanies } from '../../app/actions/companyActions';
import Logo from '../../components/Logo';

export const dynamic = 'force-dynamic';

export default async function CompaniesPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; q?: string }>;
}) {
    const { page: pageParam, q } = await searchParams;
    const query = (q || '').trim();
    const page = Math.max(1, parseInt(pageParam || '1'));

    const serverSupabase = await createClient();
    const { data: { user } } = await serverSupabase.auth.getUser();

    // Fetch initial companies
    const { companies, totalPages } = await getCompanies({
        page,
        q: query,
    });

    const companyList = companies || [];

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
                        <Link href="/companies" className="text-brand-600 font-semibold">Companies</Link>
                        {user ? (
                            <Link href="/preferences" className="bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 px-5 py-2 flex items-center gap-2 rounded-none transition-colors border border-[var(--border)] font-medium">
                                My Account & Preferences
                            </Link>
                        ) : (
                            <Link href="/login" className="bg-brand-600 hover:bg-brand-500 text-white px-5 py-2 rounded-none transition-colors shadow-sm font-medium">
                                Sign in
                            </Link>
                        )}
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <main className="pt-28 pb-16 px-4 max-w-7xl mx-auto">
                <div className="text-center py-12 lg:py-16">
                    <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tight mb-6">
                        UK Visa <span className="text-gradient">Sponsors</span>
                    </h1>
                    <p className="text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
                        Explore verified companies currently sponsoring UK visas. Discover open roles and apply directly to employers.
                    </p>

                    {/* Search Bar */}
                    <Suspense fallback={null}>
                        <CompanySearchBar initialQuery={query} />
                    </Suspense>
                </div>

                {/* Company Feed Wrapper */}
                <div className="mt-4">
                    <div className="flex items-center justify-between mb-6 border-b border-[var(--border)] pb-4">
                        <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <Building className="w-5 h-5 text-brand-500" />
                            {query ? `Search Results for "${query}"` : 'Top Sponsoring Companies'}
                        </h2>
                    </div>

                    <CompanyFeed
                        initialCompanies={companyList as any}
                        initialTotalPages={totalPages}
                        searchParams={{ q: query }}
                    />
                </div>
            </main>
        </div>
    );
}
