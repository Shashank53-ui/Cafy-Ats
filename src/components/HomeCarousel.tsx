'use client';

import { motion } from 'framer-motion';

const brands = [
    { name: "Workday", color: "text-blue-600" },
    { name: "Greenhouse", color: "text-emerald-600" },
    { name: "Lever", color: "text-slate-900" },
    { name: "SmartRecruiters", color: "text-blue-500" },
    { name: "BambooHR", color: "text-green-600" },
    { name: "iCIMS", color: "text-red-600" },
    { name: "SuccessFactors", color: "text-orange-600" },
    { name: "Pinpoint", color: "text-indigo-600" },
];

export default function HomeCarousel() {
    const allBrands = [...brands, ...brands, ...brands]; // Duplicated for seamless loop

    return (
        <div className="w-full py-10 overflow-hidden relative bg-white">

            <motion.div
                animate={{
                    x: [0, -2000],
                }}
                transition={{
                    x: {
                        repeat: Infinity,
                        repeatType: "loop",
                        duration: 40,
                        ease: "linear",
                    },
                }}
                className="flex items-center gap-20 whitespace-nowrap"
            >
                {allBrands.map((brand, idx) => (
                    <div
                        key={idx}
                        className={`flex items-center gap-2 grayscale opacity-40 hover:grayscale-0 hover:opacity-100 transition-all cursor-default group`}
                    >
                        <span className={`text-2xl lg:text-3xl font-black tracking-tighter ${brand.color}`}>
                            {brand.name}
                        </span>
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-200 group-hover:bg-brand-500 ml-4" />
                    </div>
                ))}
            </motion.div>
        </div>
    );
}
