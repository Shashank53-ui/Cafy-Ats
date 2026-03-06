'use server';

import { supabase } from '@/lib/supabase';

export interface Company {
    id: number;
    trading_name: string;
    companies_house_name: string | null;
    url: string | null;
    url_linkedin: string | null;
    url_favicon: string | null;
    description: string | null;
    estimated_num_employees_label: string | null;
    licensed_sponsor: boolean;
    active_jobs_count: number;
}

export async function getCompanies(params: {
    page?: number;
    q?: string;
    excludedCompanyIds?: number[];
}) {
    const PAGE_SIZE = 5;
    const page = params.page || 1;
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
        .from('companies')
        .select('*', { count: 'exact' });

    if (params.excludedCompanyIds && params.excludedCompanyIds.length > 0) {
        query = query.not('id', 'in', `(${params.excludedCompanyIds.join(',')})`);
    }

    if (params.q) {
        query = query.ilike('trading_name', `%${params.q}%`);
    }

    // Always order by active jobs count desc, then alphabetically
    query = query
        .order('active_jobs_count', { ascending: false, nullsFirst: false })
        .order('trading_name', { ascending: true })
        .range(from, to);

    const { data: companies, count, error } = await query;

    if (error) {
        console.error('getCompanies error:', error);
        return { companies: [], totalPages: 0 };
    }

    const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 0;

    return { companies, totalPages };
}
