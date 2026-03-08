import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import DeleteAccountButton from './DeleteAccountButton';

export default async function ProfilePage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    const email = user.email;
    const name = user.user_metadata?.full_name || user.user_metadata?.name || 'Not provided';

    return (
        <div className="max-w-3xl space-y-12">
            <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Profile Information</h2>
                <p className="text-slate-500 dark:text-slate-400">Manage your personal details and account presence.</p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-md p-6 border border-[var(--border)]">
                <div className="space-y-4">
                    <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Email Address</p>
                        <p className="text-slate-900 dark:text-white mt-1">{email}</p>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Full Name</p>
                        <p className="text-slate-900 dark:text-white mt-1">{name}</p>
                    </div>
                    <div className="pt-2">
                        <p className="text-slate-500 dark:text-slate-400 text-sm">
                            You are authenticated via Supabase. Email and password changes can be managed via your provider.
                        </p>
                    </div>
                </div>
            </div>

            <div className="border-t border-[var(--border)] pt-8">
               
                <DeleteAccountButton />
               
            </div>
        </div>
    );
}
