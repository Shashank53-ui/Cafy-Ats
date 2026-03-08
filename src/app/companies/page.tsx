import Link from 'next/link';
import { Suspense } from 'react';
import { createClient } from '../../utils/supabase/server';
import CompanyFeed from '../../components/companies/CompanyFeed';
import { getCompanies } from '../../app/actions/companyActions';
import Logo from '../../components/Logo';

export const dynamic = 'force-dynamic';

export default async function CompaniesPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; q?: string; sort?: string }>;
}) {
    const { page: pageParam, q, sort } = await searchParams;
    const query = (q || '').trim();
    const currentSort = sort || 'alphabetical';
    const page = Math.max(1, parseInt(pageParam || '1'));

    const serverSupabase = await createClient();
    const { data: { user } } = await serverSupabase.auth.getUser();

    const { companies, totalPages } = await getCompanies({
        page,
        q: query,
        sort: currentSort
    });

    const companyList = companies || [];

    return (
        <div className="min-h-screen bg-[var(--background)]">

            {/* Full-height container below fixed nav */}
            <main className="mt-16 flex h-[calc(100vh-4rem)] overflow-hidden px-4 sm:px-6 lg:px-12 w-full mx-auto">
                {/* Main Feed Container */}
                <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col pb-20 lg:pb-0">
                    <CompanyFeed
                        initialCompanies={companyList as any}
                        initialTotalPages={totalPages}
                        searchParams={{ q: query, sort: currentSort }}
                    />
                </div>
            </main>
        </div>
    );
}

