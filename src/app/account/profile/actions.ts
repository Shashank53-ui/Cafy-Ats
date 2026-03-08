'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'

export async function deleteAccount() {
    // 1. Get the authenticated user (regular client — safe)
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
        return { success: false, error: 'Not authenticated.' }
    }

    const userId = user.id

    try {
        // 2. Delete user data from all tables
        const { error: prefsError } = await supabase
            .from('user_preferences')
            .delete()
            .eq('user_id', userId)

        if (prefsError) {
            console.error('Failed to delete user_preferences:', prefsError)
            return { success: false, error: 'Failed to delete account data.' }
        }

        const { error: appliedError } = await supabase
            .from('user_applied_jobs')
            .delete()
            .eq('user_id', userId)

        if (appliedError) {
            console.error('Failed to delete user_applied_jobs:', appliedError)
            return { success: false, error: 'Failed to delete account data.' }
        }

        // 3. Delete the auth user using admin client (requires service role key)
        const adminClient = createAdminClient()
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)

        if (deleteError) {
            console.error('Failed to delete auth user:', deleteError)
            return { success: false, error: 'Failed to delete account.' }
        }

        // 4. Sign out the session (user no longer exists)
        await supabase.auth.signOut()

        return { success: true }
    } catch (err) {
        console.error('Unexpected error deleting account:', err)
        return { success: false, error: 'An unexpected error occurred.' }
    }
}
