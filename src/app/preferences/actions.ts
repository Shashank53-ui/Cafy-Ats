'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function savePreferences(formData: FormData) {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return { success: false, error: 'Not authenticated' }
    }

    // Parse multi-select values (pill buttons)
    const jobTypes = formData.getAll('job_types') as string[]
    const locations = formData.getAll('locations') as string[]
    const sponsorshipNeededStr = formData.get('sponsorship_needed') as string
    const sponsorshipNeeded = sponsorshipNeededStr === 'true'

    const sectors = formData.getAll('sectors') as string[]

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
