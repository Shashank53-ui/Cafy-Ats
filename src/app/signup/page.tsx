import Link from 'next/link';
import { signup } from '@/app/login/actions';

export default async function SignupPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string; message?: string }>;
}) {
    const { error, message } = await searchParams;

    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-[var(--card)] p-8 sm:p-10 border border-[var(--border)] rounded-none shadow-sm">
                <div>
                    <h2 className="mt-2 text-center text-3xl font-extrabold text-slate-900 dark:text-white">
                        Create an account
                    </h2>
                    <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-400">
                        Already have an account?{' '}
                        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-500">
                            Sign in here
                        </Link>
                    </p>
                </div>

                <form className="mt-8 space-y-6" action={signup}>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="email-address" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Email address
                            </label>
                            <input
                                id="email-address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                className="mt-1 appearance-none relative block w-full px-3 py-2.5 border border-[var(--border)] bg-transparent placeholder-slate-400 text-slate-900 dark:text-white rounded-none focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 sm:text-sm transition-colors"
                                placeholder="Email address"
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Password
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="new-password"
                                required
                                className="mt-1 appearance-none relative block w-full px-3 py-2.5 border border-[var(--border)] bg-transparent placeholder-slate-400 text-slate-900 dark:text-white rounded-none focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 sm:text-sm transition-colors"
                                placeholder="Create a password"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="text-sm text-red-600 dark:text-red-400 text-center font-medium bg-red-50 dark:bg-red-900/20 p-3">
                            {error}
                        </div>
                    )}

                    {message && (
                        <div className="text-sm text-emerald-600 dark:text-emerald-400 text-center font-medium bg-emerald-50 dark:bg-emerald-900/20 p-3">
                            {message}
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-none text-white bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 transition-colors"
                        >
                            Sign up & continue to preferences
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
