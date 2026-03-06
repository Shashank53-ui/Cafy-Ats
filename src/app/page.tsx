import { Database, Briefcase, MapPin, Building, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { createClient } from '../utils/supabase/server';
import SearchBar from '../components/SearchBar';
import JobFilters from '../components/JobFilters';
import Logo from '../components/Logo';
import JobFeed from '../components/JobFeed';
import { getJobs } from './actions/jobActions';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 5;

// Fix known bad URL patterns (SmartRecruiters API URL -> public page)
function fixJobUrl(url: string): string {
  if (!url) return '#';
  if (url.includes('api.smartrecruiters.com')) {
    const match = url.match(/\/companies\/([^/]+)\/postings\/([^/?#]+)/);
    if (match) return `https://jobs.smartrecruiters.com/${match[1]}/${match[2]}`;
  }
  return url;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ json?: string, page?: string, q?: string, loc?: string, tier2?: string, locs?: string | string[] }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1'));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Try to get logged-in user preferences
  const serverSupabase = await createClient();
  const { data: { user } } = await serverSupabase.auth.getUser();

  let userPrefs = null;
  if (user) {
    const { data: prefs } = await serverSupabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();
    userPrefs = prefs;
  }

  // Use the shared getJobs action for the initial load
  // This ensures stable sorting and company diversity
  const { jobs, totalPages } = await getJobs({
    page,
    q: params.q,
    loc: params.loc,
    tier2: params.tier2,
    locs: params.locs,
    userPrefs: userPrefs
  });

  const jobList = jobs || [];


  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-brand-600">
              <Logo className="w-8 h-8" />
            </div>
            <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-600 to-blue-500 dark:from-brand-400 dark:to-blue-400">
              Getlanded
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <Link href="/" className="text-brand-600 font-semibold">Jobs</Link>
            <Link href="/companies" className="hover:text-brand-600 transition-colors">Companies</Link>
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
        <div className="text-center py-12 lg:py-20">
          <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight mb-6">
            Land your dream job in the <span className="text-gradient">UK</span>
          </h1>
          <p className="text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Discover roles from thousands of verified UK visa sponsors. We accurately parse their ATS so you don't have to guess if a role is in the UK.
          </p>

          {/* Search Bar */}
          <SearchBar />
        </div>

        {/* Job Listings Wrapper */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mt-4">

          {/* Filters Sidebar */}
          <JobFilters />

          {/* Job Feed */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold">
                  {(!params.q && !params.loc && userPrefs) ? 'Recommended Jobs' : 'Latest Jobs'}
                </h2>
                {(!params.q && !params.loc && userPrefs) && (
                  <span className="bg-brand-50 border border-brand-200 text-brand-700 dark:bg-brand-900/30 dark:border-brand-800 dark:text-brand-300 text-xs font-semibold px-2 py-1 rounded-sm">
                    Based on your preferences
                  </span>
                )}
              </div>
            </div>

            <JobFeed
              initialJobs={jobList as any}
              initialTotalPages={totalPages}
              searchParams={{
                q: params.q,
                loc: params.loc,
                tier2: params.tier2,
                locs: params.locs,
                userPrefs: userPrefs
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
