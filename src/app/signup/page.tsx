'use client';

import Link from 'next/link';
import { signup, loginWithGoogle } from '@/app/login/actions';
import { Turnstile } from '@marsidev/react-turnstile';
import { useState, use, useRef, useEffect } from 'react';
import * as motion from 'framer-motion/client';
import Logo from '@/components/Logo';
import { Eye, EyeOff } from 'lucide-react';
import PhraseCarousel from '@/components/PhraseCarousel';

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

// Password strength bar
function PasswordStrength({ password }: { password: string }) {
    if (!password) return null;
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    let level = 0;
    if (password.length >= 6) level = 1;
    if (password.length >= 8) level = 2;
    if (password.length >= 8 && (hasNumber || hasSpecial)) level = 3;

    const labels = ['', 'Weak', 'Fair', 'Strong'];
    const colours = ['', 'bg-red-400', 'bg-yellow-400', 'bg-green-500'];
    const textColours = ['', 'text-red-500', 'text-yellow-500', 'text-green-600'];

    return (
        <div className="mt-2 space-y-1">
            <div className="flex gap-1">
                {[1, 2, 3].map(i => (
                    <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= level ? colours[level] : 'bg-slate-200'}`}
                    />
                ))}
            </div>
            <p className={`text-[11px] font-semibold ml-1 ${textColours[level]}`}>
                {labels[level]}
            </p>
        </div>
    );
}

export default function SignupPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string; message?: string }>;
}) {
    const { error: serverError, message } = use(searchParams);
    const [isTurnstileSolved, setIsTurnstileSolved] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});
    const formRef = useRef<HTMLFormElement>(null);

    const validate = (): boolean => {
        const form = formRef.current;
        if (!form) return false;
        const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
        const pw = (form.elements.namedItem('password') as HTMLInputElement).value;
        const confirm = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value;
        const newErrors: typeof errors = {};

        if (!email) {
            newErrors.email = 'Email is required.';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            newErrors.email = 'Please enter a valid email address.';
        }

        if (!pw) {
            newErrors.password = 'Password is required.';
        } else if (pw.length < 8) {
            newErrors.password = 'Password must be at least 8 characters.';
        } else if (!/[\d!@#$%^&*(),.?":{}|<>]/.test(pw)) {
            newErrors.password = 'Include at least one number or special character.';
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
        if (!validate()) {
            e.preventDefault();
        }
    };

    return (
        <div className="h-screen w-full flex bg-white font-sans overflow-hidden">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full flex h-full"
            >
                {/* Left Side: Form */}
                <div className="w-full lg:w-1/2 p-4 sm:p-8 md:p-10 lg:p-12 flex flex-col justify-center">
                    <div className="max-w-xl mx-auto w-full">
                        <div className="mb-4 sm:mb-6">
                            <Link href="/" className="inline-flex items-center gap-2 mb-3 sm:mb-6 group">
                                <div className="text-[#3B41FF] transition-transform group-hover:scale-110">
                                    <Logo className="w-8 h-8 sm:w-10 sm:h-10" />
                                </div>
                                <span className="text-xl font-black text-[#0066FF] tracking-tighter">
                                    Getlanded
                                </span>
                            </Link>
                            <h2 className="text-2xl sm:text-4xl font-bold text-[#1A1C36] tracking-tight mb-1 sm:mb-2">
                                Create account
                            </h2>
                            <p className="text-[#6B7280] text-sm sm:text-base">
                                Join thousands getting UK visa sponsorship
                            </p>
                        </div>

                        <div className="space-y-2 sm:space-y-4">
                            <button
                                onClick={() => loginWithGoogle()}
                                className="w-full flex items-center justify-center gap-3 px-4 py-2 sm:py-3 border border-[#E6E8EB] bg-white text-[#1A1C36] hover:bg-slate-50 transition-all rounded-xl font-semibold text-sm shadow-sm"
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                </svg>
                                Sign up with Google
                            </button>

                            <div className="relative py-1 sm:py-2">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-[#E6E8EB]"></div>
                                </div>
                                <div className="relative flex justify-center text-xs uppercase tracking-widest font-bold">
                                    <span className="px-3 bg-white text-[#6B7280]">or</span>
                                </div>
                            </div>

                            <form ref={formRef} className="space-y-2 sm:space-y-4" action={signup} onSubmit={handleSubmit}>
                                <div className="space-y-2 sm:space-y-3">
                                    {/* Email */}
                                    <div>
                                        <label htmlFor="email-address" className="block text-xs font-bold text-[#1A1C36] uppercase tracking-wider mb-1.5 ml-1">
                                            Email Address
                                        </label>
                                        <input
                                            id="email-address"
                                            name="email"
                                            type="email"
                                            autoComplete="email"
                                            onChange={() => setErrors(e => ({ ...e, email: undefined }))}
                                            className={`w-full px-4 py-2.5 sm:py-3.5 bg-[#F5F7FA] border placeholder-slate-400 text-[#1A1C36] rounded-none focus:outline-none focus:ring-2 focus:ring-[#3B41FF]/20 focus:border-[#3B41FF] text-sm transition-all ${errors.email ? 'border-red-400' : 'border-[#E6E8EB]'}`}
                                            placeholder="Enter your email"
                                        />
                                        {errors.email && <FieldError message={errors.email} />}
                                    </div>

                                    {/* Password */}
                                    <div>
                                        <label htmlFor="password" className="block text-xs font-bold text-[#1A1C36] uppercase tracking-wider mb-1.5 ml-1">
                                            Password
                                        </label>
                                        <div className="relative">
                                            <input
                                                id="password"
                                                name="password"
                                                type={showPassword ? 'text' : 'password'}
                                                autoComplete="new-password"
                                                onChange={(e) => {
                                                    setErrors(prev => ({ ...prev, password: undefined }));
                                                }}
                                                className={`w-full px-4 py-2.5 sm:py-3.5 pr-10 bg-[#F5F7FA] border placeholder-slate-400 text-[#1A1C36] rounded-none focus:outline-none focus:ring-2 focus:ring-[#3B41FF]/20 focus:border-[#3B41FF] text-sm transition-all ${errors.password ? 'border-red-400' : 'border-[#E6E8EB]'}`}
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
                                                className={`w-full px-4 py-2.5 sm:py-3.5 pr-10 bg-[#F5F7FA] border placeholder-slate-400 text-[#1A1C36] rounded-none focus:outline-none focus:ring-2 focus:ring-[#3B41FF]/20 focus:border-[#3B41FF] text-sm transition-all ${errors.confirmPassword ? 'border-red-400' : 'border-[#E6E8EB]'}`}
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

                                <div className="flex justify-center py-1 sm:py-2">
                                    <Turnstile
                                        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
                                        onSuccess={() => setIsTurnstileSolved(true)}
                                        onExpire={() => setIsTurnstileSolved(false)}
                                        onError={() => setIsTurnstileSolved(false)}
                                        options={{ theme: 'light' }}
                                    />
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
                                    className={`w-full py-3 sm:py-4 px-4 rounded-[40px] text-sm font-bold text-white transition-all shadow-lg hover:shadow-[#3B41FF]/30 active:scale-[0.98] ${isTurnstileSolved
                                        ? 'bg-[#3B41FF] hover:bg-[#2F34E0]'
                                        : 'bg-slate-300 cursor-not-allowed shadow-none'
                                        }`}
                                >
                                    Sign up & continue
                                </button>
                            </form>

                            <p className="text-center text-sm text-[#6B7280] pt-2 sm:pt-4">
                                Already have an account?{' '}
                                <Link href="/login" className="text-[#3B41FF] font-bold hover:underline">
                                    Sign in here
                                </Link>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Right Side: Carousel */}
                <div className="hidden lg:flex lg:w-1/2 bg-[#1A1C36] relative flex-col items-center justify-center overflow-hidden h-full">
                    <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-[#3B41FF]/20 rounded-full blur-[100px]"></div>
                    <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] bg-[#3B41FF]/10 rounded-full blur-[80px]"></div>
                    <div className="relative z-10 w-full px-12">
                        <PhraseCarousel dark />
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
