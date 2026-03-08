'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteAccount } from './actions';

export default function DeleteAccountButton() {
    const router = useRouter();
    const [showModal, setShowModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleConfirmDelete = async () => {
        setIsDeleting(true);
        setError(null);

        try {
            const result = await deleteAccount();
            if (!result.success) {
                setError(result.error ?? 'Failed to delete account.');
                setIsDeleting(false);
                return;
            }
            router.push('/');
            router.refresh();
        } catch (err) {
            console.error('Error deleting account:', err);
            setError('An unexpected error occurred. Please try again.');
            setIsDeleting(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setShowModal(true)}
                className="bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800 px-4 py-2 rounded-md font-medium text-sm transition-colors"
            >
                Delete Account
            </button>

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => !isDeleting && setShowModal(false)}
                    />

                    {/* Modal */}
                    <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-700">
                        {/* Icon */}
                        <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4">
                            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            </svg>
                        </div>

                        <h2 className="text-lg font-bold text-slate-900 dark:text-white text-center mb-2">
                            Delete your account?
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6 leading-relaxed">
                            This will permanently delete your account, preferences, and all tracked applications. <span className="font-semibold text-slate-700 dark:text-slate-300">This action cannot be undone.</span>
                        </p>

                        {error && (
                            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg px-3 py-2 mb-4 text-center">
                                {error}
                            </p>
                        )}

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setShowModal(false)}
                                disabled={isDeleting}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmDelete}
                                disabled={isDeleting}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isDeleting ? (
                                    <>
                                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                        </svg>
                                        Deleting...
                                    </>
                                ) : 'Yes, delete account'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
