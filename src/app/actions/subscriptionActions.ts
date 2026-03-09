'use server';

import { createClient } from '@/utils/supabase/server';
import { cache } from 'react';

export const getSubscriptionStatus = cache(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { isPro: false, subscription: null };
    }

    const { data: subscription, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['trialing', 'active'])
        .maybeSingle();

    if (error) {
        console.error('Error fetching subscription status:', error);
    }

    console.log(`Subscription check for ${user.id}:`, subscription);

    return {
        isPro: !!subscription,
        subscription: subscription || null,
    };
});
