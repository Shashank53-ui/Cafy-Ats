import { createClient } from '@/utils/supabase/server';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { redirect } from 'next/navigation';
import AccountTabs from './AccountTabs';

export default async function AccountLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    return (
        <div className="min-h-screen bg-[var(--background)]">


            <div className="max-w-4xl mx-auto pt-28 px-4 sm:px-6 lg:px-8 pb-12">
                <div className="mb-8">
                    <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">
                        Account Settings
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400">
                        Manage your profile, preferences, and subscription details.
                    </p>
                </div>

                <div className="bg-white dark:bg-[#0B1120] border border-[var(--border)] rounded-md shadow-sm overflow-hidden">
                    {/* Tabs Component (Client Side) */}
                    <AccountTabs />

                    <div className="p-6 sm:p-8">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
