'use client';

import { useState } from 'react';
import { savePreferences } from './actions';
import { useRouter } from 'next/navigation';
import { Check, X, ChevronDown } from 'lucide-react';

const JOB_TYPES = [
    'Full-time',
    'Part-time',
    'Internship',
    'Placement scheme'
];

const LOCATIONS = [
    'London',
    'Rest of UK',
    'Scotland',
    'Wales'
];

const SECTORS = [
    'Business & Strategy',
    'Customer Success',
    'Data',
    'Design',
    'Engineering (Hardware)',
    'Engineering (Other)',
    'Engineering (Software)',
    'Finance',
    'Healthcare',
    'HR / People',
    'Legal',
    'Marketing & PR',
    'Media & Journalism',
    'Operations',
    'Other',
    'Product Management',
    'Project Management',
    'Research (Non-technical)',
    'Research (Technical)',
    'Sales & Partnerships'
];

export default function PreferencesForm({ initialData }: { initialData: any }) {
    const router = useRouter();
    const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>(initialData?.job_types || ['Full-time']);
    const [selectedLocations, setSelectedLocations] = useState<string[]>(initialData?.locations || ['London']);
    const [sponsorshipNeeded, setSponsorshipNeeded] = useState<boolean>(initialData?.sponsorship_needed ?? true);
    const [selectedSectors, setSelectedSectors] = useState<string[]>(initialData?.sectors || []);
    const [loading, setLoading] = useState(false);

    const toggleJobType = (type: string) => {
        setSelectedJobTypes(prev =>
            prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
        );
    };

    const toggleLocation = (loc: string) => {
        setSelectedLocations(prev =>
            prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc]
        );
    };

    const toggleSector = (sector: string) => {
        setSelectedSectors(prev =>
            prev.includes(sector) ? prev.filter(s => s !== sector) : [...prev, sector]
        );
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);

        const formData = new FormData();
        selectedJobTypes.forEach(t => formData.append('job_types', t));
        selectedLocations.forEach(l => formData.append('locations', l));
        formData.append('sponsorship_needed', sponsorshipNeeded.toString());
        selectedSectors.forEach(s => formData.append('sectors', s));

        try {
            const result = await savePreferences(formData);
            if (result && !result.success) {
                alert('Backend Error: ' + result.error);
                setLoading(false);
                return;
            }
            router.push('/');
        } catch (error: any) {
            console.error(error);
            alert('An unexpected error occurred: ' + (error.message || 'Check console'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-12">
            {/* Job Types */}
            <div className="space-y-4">
                <h3 className="text-lg font-medium text-slate-900 dark:text-white">What types of jobs are you looking for?</h3>
                <div className="border border-[var(--border)] p-4 bg-white dark:bg-slate-900 shadow-sm relative min-h-[50px]">
                    <div className="flex flex-wrap gap-2 mb-4">
                        {selectedJobTypes.map(type => (
                            <div key={type} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium">
                                {type}
                                <button type="button" onClick={() => toggleJobType(type)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="border-t border-[var(--border)] pt-4 mt-2">
                        {JOB_TYPES.filter(t => !selectedJobTypes.includes(t)).map(type => (
                            <button
                                key={type}
                                type="button"
                                onClick={() => toggleJobType(type)}
                                className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Locations */}
            <div className="space-y-4">
                <h3 className="text-lg font-medium text-slate-900 dark:text-white">Where are you interested in working?</h3>
                <div className="flex flex-wrap gap-2 p-4 bg-white dark:bg-slate-900 border border-[var(--border)] shadow-sm">
                    {LOCATIONS.map(loc => {
                        const isSelected = selectedLocations.includes(loc);
                        return (
                            <button
                                key={loc}
                                type="button"
                                onClick={() => toggleLocation(loc)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors border ${isSelected ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-transparent' : 'bg-transparent text-slate-600 dark:text-slate-400 border-[var(--border)] hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                            >
                                {loc}
                                {isSelected && <X className="w-3 h-3 text-slate-400" />}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Sponsorship */}
            <div className="space-y-4">
                <h3 className="text-lg font-medium text-slate-900 dark:text-white">Do you want immediate sponsorship?</h3>
                <div className="relative">
                    <select
                        value={sponsorshipNeeded ? 'true' : 'false'}
                        onChange={(e) => setSponsorshipNeeded(e.target.value === 'true')}
                        className="appearance-none block w-full px-4 py-3 bg-white dark:bg-slate-900 border border-[var(--border)] text-slate-900 dark:text-white text-base focus:outline-none focus:ring-1 focus:ring-brand-500 shadow-sm pr-10"
                    >
                        <option value="true">Yes, I need to be sponsored immediately</option>
                        <option value="false">No</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                </div>
                {!sponsorshipNeeded && (
                    <div className="bg-brand-50 dark:bg-brand-900/10 border border-brand-100 dark:border-brand-800 p-4 mt-2">
                        <h4 className="font-semibold text-slate-900 dark:text-white mb-1">What does this mean?</h4>
                        <p className="text-slate-600 dark:text-slate-400 text-sm">
                            If you choose "No", we will match you with jobs that won't be sponsored straight away but will at least help you get your foot in the door with a <span className="font-semibold underline underline-offset-2">licensed sponsor</span>.
                        </p>
                    </div>
                )}
            </div>

            {/* Sector */}
            <div className="space-y-4">
                <h3 className="text-lg font-medium text-slate-900 dark:text-white">What sectors are you interested in?</h3>
                <div className="border border-[var(--border)] p-4 bg-white dark:bg-slate-900 shadow-sm">
                    <div className="flex flex-wrap gap-2 mb-4">
                        {selectedSectors.length > 0 ? (
                            selectedSectors.map(sector => (
                                <div key={sector} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium">
                                    {sector}
                                    <button type="button" onClick={() => toggleSector(sector)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))
                        ) : (
                            <span className="text-sm text-slate-400 italic">No sectors selected</span>
                        )}
                    </div>
                    <div className="border-t border-[var(--border)] pt-4 grid grid-cols-1 sm:grid-cols-2 gap-1 overflow-y-auto max-h-48 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {SECTORS.map(sector => {
                            const isSelected = selectedSectors.includes(sector);
                            return (
                                <button
                                    key={sector}
                                    type="button"
                                    onClick={() => toggleSector(sector)}
                                    className={`text-left px-3 py-1.5 text-xs transition-colors ${isSelected ? 'text-brand-600 font-semibold bg-brand-50 dark:bg-brand-900/20' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                                >
                                    {isSelected ? '✓ ' : '+ '}{sector}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Submit */}
            <div className="pt-6">
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 px-6 shadow-sm disabled:opacity-50 transition-colors"
                >
                    {loading ? 'Saving...' : 'Save Preferences'}
                </button>
            </div>
        </form>
    );
}
