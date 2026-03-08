import { Briefcase, Building, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import PhraseCarousel from '../components/PhraseCarousel';

export const dynamic = 'force-dynamic';

export default async function Home() {
  return (
    <div className="min-h-screen bg-white selection:bg-blue-100 selection:text-blue-900 overflow-x-hidden">
      {/* Hero Section */}
      <main className="min-h-screen pt-16 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 relative overflow-hidden bg-white">
        <div className="w-full max-w-5xl flex flex-col items-center">

          {/* Text Carousel Hero */}
          <div className="w-full mb-4">
            <PhraseCarousel />
          </div>

          {/* Compact Navigation Cards */}
          <div className="w-full max-w-5xl mx-auto mb-12 px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card 1: Recommended jobs */}
              <Link
                href="/jobs"
                className="group p-8 bg-white border border-slate-100 hover:border-brand-200 hover:shadow-2xl hover:shadow-brand-50/50 transition-all flex flex-col items-start rounded-3xl relative overflow-hidden"
              >
                <div className="w-11 h-11 bg-slate-50 group-hover:bg-brand-50 flex items-center justify-center text-slate-900 group-hover:text-brand-600 mb-6 transition-colors rounded-xl">
                  <Briefcase className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2 flex items-center">
                  Search jobs <ArrowRight className="w-4 h-4 ml-2 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all font-black text-brand-600" />
                </h3>
                <p className="text-slate-500 font-medium leading-relaxed mb-6 text-sm">
                  Explore jobs at companies that can sponsor your visa
                </p>
                <div className="flex items-center gap-2 text-emerald-600 font-bold text-[11px] uppercase tracking-[0.2em]">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  20,000+ jobs available
                </div>
              </Link>

              {/* Card 2: Companies */}
              <Link
                href="/companies"
                className="group p-8 bg-white border border-slate-100 hover:border-brand-200 hover:shadow-2xl hover:shadow-brand-50/50 transition-all flex flex-col items-start rounded-3xl relative overflow-hidden"
              >
                <div className="w-11 h-11 bg-slate-50 group-hover:bg-brand-50 flex items-center justify-center text-slate-900 group-hover:text-brand-600 mb-6 transition-colors rounded-xl">
                  <Building className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2 flex items-center">
                  Companies that sponsor <ArrowRight className="w-4 h-4 ml-2 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all font-black text-brand-600" />
                </h3>
                <p className="text-slate-500 font-medium leading-relaxed mb-6 text-sm">
                  Search for companies that have the ability to offer visa sponsorship
                </p>
                <div className="flex items-center gap-2 text-emerald-600 font-bold text-[11px] uppercase tracking-[0.2em]">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  2,500+ companies identified
                </div>
              </Link>
            </div>
          </div>

          {/* Background decoration */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 opacity-[0.02] select-none pointer-events-none overflow-hidden w-full text-center">
            <span className="text-[280px] font-black leading-none whitespace-nowrap tracking-tighter">
              UK SPONSORSHIP
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
