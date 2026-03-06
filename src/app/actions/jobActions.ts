'use server';

import { supabase } from '@/lib/supabase';

export interface Job {
    id: string;
    title: string;
    url: string;
    location: string;
    department?: string;
    created_at: string;
    company_id: number;
    company?: {
        trading_name: string;
        companies_house_name: string | null;
        url_favicon: string | null;
        licensed_sponsor: boolean;
    };
}

export async function getJobs(params: {
    page?: number;
    q?: string;
    loc?: string;
    tier2?: string;
    locs?: string | string[];
    userPrefs?: any;
    excludedJobIds?: string[];
    excludedCompanyIds?: number[];
    company_id?: number;
}) {
    const PAGE_SIZE = 5;
    const page = params.page || 1;
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
        .from('jobs')
        .select('*, company:companies!inner(*)', { count: 'exact' });

    // 0. Exclusions for stability and diversity
    if (params.excludedJobIds && params.excludedJobIds.length > 0) {
        query = query.not('id', 'in', `(${params.excludedJobIds.join(',')})`);
    }
    if (params.excludedCompanyIds && params.excludedCompanyIds.length > 0) {
        query = query.not('company_id', 'in', `(${params.excludedCompanyIds.join(',')})`);
    }
    if (params.company_id) {
        query = query.eq('company_id', params.company_id);
    }

    // 1. Text Search
    if (params.q) {
        query = query.or(`title.ilike.%${params.q}%, company.trading_name.ilike.%${params.q}%`);
    }

    // 2. City Filter
    if (params.loc) {
        query = query.ilike('location', `%${params.loc}%`);
    }

    // 3. Dropdown Checkbox Locations
    if (params.locs) {
        const locArray = Array.isArray(params.locs) ? params.locs : [params.locs];
        if (locArray.length > 0) {
            const locFilter = locArray.map(l => `location.ilike.%${l}%`).join(',');
            query = query.or(locFilter);
        }
    } else if (!params.q && !params.loc && params.userPrefs?.locations?.length > 0) {
        const expandedLocations: string[] = [];
        params.userPrefs.locations.forEach((l: string) => {
            if (l === 'Rest of UK' || l === 'Rest of the UK') {
                expandedLocations.push('Manchester', 'Birmingham', 'Leeds', 'Glasgow', 'Sheffield', 'Bristol', 'Liverpool', 'Newcastle', 'Nottingham', 'Southampton', 'Reading');
            } else {
                expandedLocations.push(l);
            }
        });
        const locFilter = expandedLocations.map(l => `location.ilike.%${l}%`).join(',');
        query = query.or(locFilter);
    }

    // 4. Sponsor Visa check
    if (params.tier2 === 'true') {
        query = query.eq('company.licensed_sponsor', true);
    } else if (!params.q && !params.loc && !params.tier2 && params.userPrefs?.sponsorship_needed) {
        query = query.eq('company.licensed_sponsor', true);
    }

    // 5. Job Type matching
    if (!params.q && params.userPrefs?.job_types?.length > 0) {
        const typeKeywords: Record<string, string[]> = {
            'Internship': ['intern', 'placement', 'internship', 'student', 'graduate'],
            'Placement scheme': ['placement', 'scheme', 'internship'],
            'Part-time': ['part-time', 'part time', 'hourly', 'flexible'],
            'Full-time': ['full-time', 'full time', 'permanent']
        };

        let allTypeKeywords: string[] = [];
        let hasNonFullTime = false;

        params.userPrefs.job_types.forEach((type: string) => {
            if (type !== 'Full-time' && typeKeywords[type]) {
                allTypeKeywords.push(...typeKeywords[type]);
                hasNonFullTime = true;
            }
        });

        if (hasNonFullTime && allTypeKeywords.length > 0) {
            const typeFilter = allTypeKeywords.map(k => `title.ilike.%${k}%`).join(',');
            query = query.or(typeFilter);
        }
    }

    // 6. Category preference
    if (!params.q && params.userPrefs?.sectors?.length > 0) {
        const sectorKeywords: Record<string, string[]> = {
            'Business & Strategy': ['business', 'strategy', 'consultant', 'analyst', 'corporate', 'planning'],
            'Customer Success': ['customer', 'success', 'support', 'account', 'client'],
            'Data': ['data', 'analytics', 'statistics', 'machine learning', 'ai', 'sql', 'python', 'bi', 'business intelligence'],
            'Design': ['design', 'ui', 'ux', 'product designer', 'graphic', 'creative', 'art'],
            'Engineering (Hardware)': ['hardware', 'electrical', 'electronics', 'mechanical', 'manufacturing', 'firmware'],
            'Engineering (Other)': ['engineering', 'engineer', 'civil', 'chemical', 'biomedical', 'systems'],
            'Engineering (Software)': ['software', 'developer', 'engineer', 'frontend', 'backend', 'fullstack', 'ios', 'android', 'web', 'devops', 'cloud'],
            'Finance': ['finance', 'accounting', 'tax', 'audit', 'financial', 'quant', 'trading', 'investment'],
            'Healthcare': ['health', 'medical', 'clinical', 'nurse', 'doctor', 'pharma', 'biotech'],
            'HR / People': ['hr', 'human resources', 'people', 'talent', 'recruiter', 'recruiting', 'acquisition'],
            'Legal': ['legal', 'counsel', 'lawyer', 'attorney', 'law', 'compliance'],
            'Marketing & PR': ['marketing', 'pr', 'public relations', 'brand', 'content', 'social media', 'communications', 'seo', 'growth'],
            'Media & Journalism': ['media', 'journalism', 'writer', 'editor', 'reporter', 'news', 'broadcast'],
            'Operations': ['operations', 'logistics', 'supply chain', 'facilities', 'admin'],
            'Other': [],
            'Product Management': ['product', 'pm', 'product manager', 'owner'],
            'Project Management': ['project', 'program', 'scrum', 'agile', 'delivery'],
            'Research (Non-technical)': ['research', 'market research', 'user research', 'ur'],
            'Research (Technical)': ['research', 'r&d', 'scientist', 'phd', 'investigator'],
            'Sales & Partnerships': ['sales', 'partnerships', 'bd', 'business development', 'account executive', 'bdr', 'sdr']
        };

        let allKeywords: string[] = [];
        params.userPrefs.sectors.forEach((sector: string) => {
            if (sectorKeywords[sector]) {
                allKeywords.push(...sectorKeywords[sector]);
            }
        });
        allKeywords.push(...params.userPrefs.sectors);
        allKeywords = [...new Set(allKeywords)].filter(k => k.trim().length > 0);

        if (allKeywords.length > 0) {
            const filterConditions = allKeywords.map(keyword => `title.ilike.%${keyword}%,department.ilike.%${keyword}%`).join(',');
            query = query.or(filterConditions);
        }
    }

    // Stable sorting: created_at desc, then id desc
    query = query.order('created_at', { ascending: false }).order('id', { ascending: false });

    let rawJobs;
    let count;

    if (params.company_id) {
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const result = await query.range(from, to);
        rawJobs = result.data;
        count = result.count;
    } else {
        // Fetch a larger batch to handle diversity filtering
        // Since we are excluding IDs, we always fetch from index 0 of the remaining set
        const result = await query.range(0, 49);
        rawJobs = result.data;
        count = result.count;
    }

    if (!rawJobs) return { jobs: [], totalPages: 0 };

    let finalJobs: Job[] = [];

    if (params.company_id) {
        // If fetching for a specific company, skip diversity logic
        finalJobs = rawJobs;
    } else {
        const seenCompaniesThisBatch = new Set();
        for (const job of rawJobs) {
            if (!seenCompaniesThisBatch.has(job.company_id)) {
                finalJobs.push(job);
                seenCompaniesThisBatch.add(job.company_id);
            }
            if (finalJobs.length >= PAGE_SIZE) break;
        }
    }

    // Fallback if we have very few companies but many jobs
    if (finalJobs.length < PAGE_SIZE && rawJobs.length > 0) {
        for (const job of rawJobs) {
            if (!finalJobs.find(j => j.id === job.id)) {
                finalJobs.push(job);
            }
            if (finalJobs.length >= PAGE_SIZE) break;
        }
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    return { jobs: finalJobs, totalPages };
}
