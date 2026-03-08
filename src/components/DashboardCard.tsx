'use client';

import { motion } from 'framer-motion';
import { Briefcase, Building, MapPin, Calendar, ArrowUpRight, DollarSign, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

interface DashboardCardProps {
    title: string;
    subtitle: string;
    location?: string;
    salary?: string;
    type?: string;
    isVerified?: boolean;
    href: string;
    image?: string;
    tags?: string[];
}

export default function DashboardCard({
    title,
    subtitle,
    location,
    salary,
    type,
    isVerified,
    href,
    image,
    tags
}: DashboardCardProps) {
    return (
        <motion.div
            whileHover={{ y: -2 }}
            className="group relative bg-white border border-slate-100/50 rounded-none p-5 transition-all hover:shadow-xl hover:shadow-slate-200/50"
        >
            <div className="flex items-center gap-4">
                {/* Company Logo */}
                <div className="w-16 h-16 bg-slate-50 rounded-none flex items-center justify-center overflow-hidden flex-shrink-0 border border-slate-100 group-hover:border-[#0066FF]/20 transition-colors">
                    {image ? (
                        <img src={image} alt={subtitle} className="w-full h-full object-cover" />
                    ) : (
                        <div className="text-[#0066FF]/40 group-hover:text-[#0066FF] transition-colors">
                            <Building className="w-7 h-7" />
                        </div>
                    )}
                </div>

                {/* Job Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-[17px] font-bold text-[#111827] truncate group-hover:text-[#0066FF] transition-colors leading-tight">
                            {title}
                        </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="text-[14px] font-semibold text-[#4B5563]">
                            {subtitle}
                        </p>
                        <div className="w-1 h-1 rounded-none bg-slate-300"></div>
                        <div className="flex items-center gap-1 text-[13px] font-medium text-slate-400">
                            <MapPin className="w-3.5 h-3.5" />
                            {location}
                        </div>
                    </div>
                </div>

                {/* Action */}
                <div className="flex flex-col items-end justify-center ml-2">
                    <div className="text-[14px] font-bold text-[#111827]">
                        {salary?.split(' - ')[0] || salary}
                    </div>
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                <div className="flex gap-2">
                    {tags?.slice(0, 3).map((tag, i) => {
                        const colors = [
                            'bg-blue-50 text-blue-600 border-blue-100',
                            'bg-emerald-50 text-emerald-600 border-emerald-100',
                            'bg-amber-50 text-amber-600 border-amber-100',
                            'bg-purple-50 text-purple-600 border-purple-100',
                            'bg-rose-50 text-rose-600 border-rose-100',
                        ];
                        const colorClass = colors[i % colors.length];
                        return (
                            <span key={i} className={`px-3 py-1 border ${colorClass} text-[11px] font-black uppercase tracking-wider rounded-none`}>
                                {tag}
                            </span>
                        );
                    })}
                </div>
            </div>
        </motion.div>
    );
}
