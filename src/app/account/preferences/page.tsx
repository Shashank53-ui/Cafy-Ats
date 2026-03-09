import PreferencesForm from './PreferencesForm';
import { createClient } from '@/utils/supabase/server';
import Link from 'next/link';
import Logo from '@/components/Logo';

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
        <div className="w-full">
            <div className="mb-12 text-center max-w-2xl mx-auto">
                <h1 className="text-4xl font-black text-black mb-4">
                    Complete your profile
                </h1>
                <p className="text-slate-500 font-medium text-lg">
                    Tell us what you're looking for so we can find the perfect UK sponsor for you.
                </p>
            </div>

            <PreferencesForm initialData={initialData} />
        </div>
    );
}
