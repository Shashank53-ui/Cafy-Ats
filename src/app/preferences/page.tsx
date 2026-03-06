import PreferencesForm from './PreferencesForm';
import { createClient } from '@/utils/supabase/server';

export default async function PreferencesPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let initialData = null;
    if (user) {
        const { data } = await supabase
            .from('user_preferences')
            .select('*')
            .eq('user_id', user.id)
            .single();
        initialData = data;
    }

    return (
        <div className="min-h-screen bg-[var(--background)] py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto mt-16">
                <div className="mb-10">
                    <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-2">
                        Your job preferences
                    </h1>
                    <p className="text-lg text-slate-500 dark:text-slate-400">
                        Customize your feed to see the roles that match your career goals.
                    </p>
                </div>

                <PreferencesForm initialData={initialData} />
            </div>
        </div>
    );
}
