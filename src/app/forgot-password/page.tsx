'use client';

import Link from 'next/link';
import { requestPasswordReset } from '@/app/login/actions';
import { Turnstile } from '@marsidev/react-turnstile';
import { useState, use } from 'react';
import * as motion from 'framer-motion/client';
import Logo from '@/components/Logo';

export default function ForgotPasswordPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string; message?: string }>;
}) {
    const { error, message } = use(searchParams);
    const [isTurnstileSolved, setIsTurnstileSolved] = useState(false);

    return (
        <div className="h-screen w-full flex bg-white font-sans overflow-hidden">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full flex h-full"
            >
                {/* Left Side: Form */}
                <div className="w-full lg:w-1/2 p-6 sm:p-8 md:p-10 lg:p-12 flex flex-col justify-center h-full overflow-hidden">
                    <div className="max-w-md mx-auto w-full">
                        <div className="mb-6">
                            <Link href="/login" className="inline-flex items-center text-sm font-bold text-[#3B41FF] hover:underline mb-8">
                                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                                </svg>
                                Back to login
                            </Link>
                            <h2 className="text-4xl font-bold text-[#1A1C36] tracking-tight mb-2">
                                Forgot password?
                            </h2>
                            <p className="text-[#6B7280] text-base">
                                No worries, we'll send you reset instructions.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <form className="space-y-4" action={requestPasswordReset}>
                                <div>
                                    <label htmlFor="email-address" className="block text-xs font-bold text-[#1A1C36] uppercase tracking-wider mb-1.5 ml-1">
                                        Email Address
                                    </label>
                                    <input
                                        id="email-address"
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        required
                                        className="w-full px-4 py-3.5 bg-[#F5F7FA] border border-[#E6E8EB] placeholder-slate-400 text-[#1A1C36] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3B41FF]/20 focus:border-[#3B41FF] text-sm transition-all"
                                        placeholder="Enter your account email"
                                    />
                                </div>

                                <div className="flex justify-center py-2">
                                    <Turnstile
                                        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
                                        onSuccess={() => setIsTurnstileSolved(true)}
                                        onExpire={() => setIsTurnstileSolved(false)}
                                        onError={() => setIsTurnstileSolved(false)}
                                        options={{ theme: 'light' }}
                                    />
                                </div>

                                {error && (
                                    <motion.div
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="text-xs text-red-600 font-bold bg-red-50 p-3 rounded-xl border border-red-100"
                                    >
                                        {error}
                                    </motion.div>
                                )}

                                {message && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="text-xs text-emerald-600 font-bold bg-emerald-50 p-4 rounded-xl border border-emerald-100 leading-relaxed shadow-sm"
                                    >
                                        {message}
                                    </motion.div>
                                )}

                                <button
                                    type="submit"
                                    disabled={!isTurnstileSolved}
                                    className={`w-full py-4 px-4 rounded-[40px] text-sm font-bold text-white transition-all shadow-lg hover:shadow-[#3B41FF]/30 active:scale-[0.98] ${isTurnstileSolved
                                        ? 'bg-[#3B41FF] hover:bg-[#2F34E0]'
                                        : 'bg-slate-300 cursor-not-allowed shadow-none'
                                        }`}
                                >
                                    Reset password
                                </button>
                            </form>
                        </div>
                    </div>
                </div>

                {/* Right Side: Marketing */}
                <div className="hidden lg:flex lg:w-1/2 bg-white relative p-12 lg:p-16 flex-col justify-between overflow-hidden h-full border-l border-slate-100">
                    <div className="relative z-10">
                        <Logo className="w-12 h-12 text-[#0066FF] mb-6" />
                        <h3 className="text-4xl font-bold text-slate-900 leading-tight mb-6">
                            Security<br />
                            is our top<br />
                            <span className="text-[#3B41FF]">priority.</span>
                        </h3>
                    </div>

                    <div className="relative z-10">
                        <div className="p-8 bg-slate-50 border border-slate-100 rounded-3xl">
                            <p className="text-slate-600 italic text-lg leading-relaxed">
                                "GetLanded ensures your data is protected while you focus on landing your dream UK role with visa sponsorship."
                            </p>
                        </div>

                        <div className="flex gap-2 mt-8 justify-center">
                            <div className="w-1.5 h-1.5 bg-slate-200 rounded-full"></div>
                            <div className="w-8 h-1.5 bg-[#3B41FF] rounded-full"></div>
                            <div className="w-1.5 h-1.5 bg-slate-200 rounded-full"></div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
