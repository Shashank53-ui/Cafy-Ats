'use client';

import Link from 'next/link';
import { updatePassword } from '@/app/login/actions';
import { useState, use, useRef, useEffect } from 'react';
import * as motion from 'framer-motion/client';
import Logo from '@/components/Logo';
import { Eye, EyeOff } from 'lucide-react';

// Auto-dismissing inline field error
function FieldError({ message }: { message: string }) {
    const [visible, setVisible] = useState(true);
    useEffect(() => {
        const t = setTimeout(() => setVisible(false), 4000);
        return () => clearTimeout(t);
    }, [message]);
    if (!visible) return null;
    return (
        <motion.p
            key={message}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-red-500 font-medium mt-1 ml-1"
        >
            {message}
        </motion.p>
    );
}

export default function ResetPasswordPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>;
}) {
    const { error: serverError } = use(searchParams);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
    const formRef = useRef<HTMLFormElement>(null);

    const validate = (): boolean => {
        const form = formRef.current;
        if (!form) return false;
        const pw = (form.elements.namedItem('password') as HTMLInputElement).value;
        const confirm = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value;
        const newErrors: typeof errors = {};

        if (!pw) {
            newErrors.password = 'Password is required.';
        } else if (pw.length < 8) {
            newErrors.password = 'Password must be at least 8 characters.';
        }

        if (!confirm) {
            newErrors.confirmPassword = 'Please confirm your password.';
        } else if (confirm !== pw) {
            newErrors.confirmPassword = 'Passwords do not match.';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        if (!validate()) e.preventDefault();
    };

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
                            <Link href="/" className="inline-flex items-center gap-2 mb-8">
                                <div className="text-[#3B41FF]">
                                    <Logo className="w-10 h-10" />
                                </div>
                                <span className="text-xl font-black text-[#0066FF] tracking-tighter">Getlanded</span>
                            </Link>
                            <h2 className="text-4xl font-bold text-[#1A1C36] tracking-tight mb-2">
                                Reset password
                            </h2>
                            <p className="text-[#6B7280] text-base">
                                Choose a strong password to protect your account.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <form ref={formRef} className="space-y-4" action={updatePassword} onSubmit={handleSubmit}>
                                <div className="space-y-4">
                                    {/* New Password */}
                                    <div>
                                        <label htmlFor="password" className="block text-xs font-bold text-[#1A1C36] uppercase tracking-wider mb-1.5 ml-1">
                                            New Password
                                        </label>
                                        <div className="relative">
                                            <input
                                                id="password"
                                                name="password"
                                                type={showPassword ? 'text' : 'password'}
                                                autoComplete="new-password"
                                                onChange={() => setErrors(e => ({ ...e, password: undefined }))}
                                                className={`w-full px-4 py-3.5 pr-10 bg-[#F5F7FA] border placeholder-slate-400 text-[#1A1C36] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3B41FF]/20 focus:border-[#3B41FF] text-sm transition-all ${errors.password ? 'border-red-400' : 'border-[#E6E8EB]'}`}
                                                placeholder="••••••••"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute inset-y-0 right-0 pr-3 flex items-center justify-center text-slate-400 hover:text-slate-600 focus:outline-none"
                                            >
                                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                            </button>
                                        </div>
                                        {errors.password && <FieldError message={errors.password} />}
                                    </div>

                                    {/* Confirm Password */}
                                    <div>
                                        <label htmlFor="confirmPassword" className="block text-xs font-bold text-[#1A1C36] uppercase tracking-wider mb-1.5 ml-1">
                                            Confirm Password
                                        </label>
                                        <div className="relative">
                                            <input
                                                id="confirmPassword"
                                                name="confirmPassword"
                                                type={showConfirmPassword ? 'text' : 'password'}
                                                autoComplete="new-password"
                                                onChange={() => setErrors(e => ({ ...e, confirmPassword: undefined }))}
                                                className={`w-full px-4 py-3.5 pr-10 bg-[#F5F7FA] border placeholder-slate-400 text-[#1A1C36] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3B41FF]/20 focus:border-[#3B41FF] text-sm transition-all ${errors.confirmPassword ? 'border-red-400' : 'border-[#E6E8EB]'}`}
                                                placeholder="••••••••"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                className="absolute inset-y-0 right-0 pr-3 flex items-center justify-center text-slate-400 hover:text-slate-600 focus:outline-none"
                                            >
                                                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                            </button>
                                        </div>
                                        {errors.confirmPassword && <FieldError message={errors.confirmPassword} />}
                                    </div>
                                </div>

                                {serverError && (
                                    <motion.div
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="text-xs text-red-600 font-bold bg-red-50 p-3 rounded-xl border border-red-100"
                                    >
                                        {serverError}
                                    </motion.div>
                                )}

                                <button
                                    type="submit"
                                    className="w-full py-4 px-4 rounded-[40px] text-sm font-bold text-white bg-[#3B41FF] hover:bg-[#2F34E0] transition-all shadow-lg hover:shadow-[#3B41FF]/30 active:scale-[0.98]"
                                >
                                    Update password
                                </button>
                            </form>
                        </div>
                    </div>
                </div>

                {/* Right Side */}
                <div className="hidden lg:flex lg:w-1/2 bg-[#1A1C36] relative flex-col items-center justify-center overflow-hidden h-full">
                    <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-[#3B41FF]/20 rounded-full blur-[100px]"></div>
                    <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] bg-[#3B41FF]/10 rounded-full blur-[80px]"></div>
                    <div className="relative z-10 px-16 text-center">
                        <Logo className="w-12 h-12 text-white/90 mx-auto mb-6" />
                        <h3 className="text-4xl font-bold text-white leading-tight mb-4">
                            Protecting<br />
                            your privacy<br />
                            <span className="text-[#3B41FF]">always.</span>
                        </h3>
                        <p className="text-white/50 text-sm mt-4">
                            Updating your password regularly keeps your sponsorship journey secure.
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
