'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { ALLOWED_JOB_TYPES, ALLOWED_LOCATIONS, ALLOWED_SECTORS } from '@/lib/constants'

export async function savePreferences(formData: FormData) {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return { success: false, error: 'Not authenticated' }
    }

    // Whitelist-validate all inputs against allowed values
    const jobTypes = formData.getAll('job_types').filter(t => (ALLOWED_JOB_TYPES as readonly string[]).includes(t as string))
    const locations = formData.getAll('locations').filter(l => (ALLOWED_LOCATIONS as readonly string[]).includes(l as string))
    const sectors = formData.getAll('sectors').filter(s => (ALLOWED_SECTORS as readonly string[]).includes(s as string))
    const sponsorshipNeededStr = formData.get('sponsorship_needed') as string
    const sponsorshipNeeded = sponsorshipNeededStr === 'true'

    const { error } = await supabase
        .from('user_preferences')
        .upsert({
            user_id: user.id,
            job_types: jobTypes,
            locations: locations,
            sponsorship_needed: sponsorshipNeeded,
            sectors: sectors,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' })

    if (error) {
        console.error('Error saving preferences:', error)
        return { success: false, error: error.message || 'Failed to save preferences to database' }
    }

    revalidatePath('/', 'layout')
    return { success: true }
}
