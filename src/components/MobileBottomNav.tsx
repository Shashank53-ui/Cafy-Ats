
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const MobileBottomNav: React.FC = () => {
    const pathname = usePathname();

    const navLinks = [
        {
            name: 'Jobs',
            href: '/jobs',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745V6a2 2 0 012-2h14a2 2 0 012 2v7.255z"></path>
                </svg>
            )
        },
        {
            name: 'Companies',
            href: '/companies',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
                </svg>
            )
        },
        {
            name: 'Applied',
            href: '/applied',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
                </svg>
            )
        },
        {
            name: 'Profile',
            href: '/account/profile',
            icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                </svg>
            )
        },
    ];

    const isActive = (path: string) => pathname === path;

    const isAuthPage = ['/login', '/signup', '/forgot-password', '/reset-password'].includes(pathname);

    if (isAuthPage) {
        return null;
    }

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 glass border-t border-[var(--border)] px-6 py-3 flex items-center justify-between z-50">
            {navLinks.map((link) => (
                <Link
                    key={link.href}
                    href={link.href}
                    className={`flex flex-col items-center gap-1 ${isActive(link.href) ? 'text-[#0066FF]' : 'text-slate-400'
                        } transition-colors`}
                >
                    {link.icon}
                    <span className="text-[10px] font-bold uppercase tracking-tighter">{link.name}</span>
                </Link>
            ))}
        </div>
    );
};

export default MobileBottomNav;
