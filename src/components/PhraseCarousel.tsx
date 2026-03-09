'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

const phrases = [
    {
        line1: "Stop sending resumes everywhere.",
        line2: "Apply where you actually",
        highlight: "belong."
    },
    {
        line1: "Not every job is worth your time.",
        line2: "Find the ones that are",
        highlight: "real."
    },
    {
        line1: "Don't chase listings.",
        line2: "Chase the ones that actually",
        highlight: "hire."
    },
    {
        line1: "Your career deserves better signals.",
        line2: "See what companies really",
        highlight: "want."
    },
    {
        line1: "Before you click apply.",
        line2: "Know what you're walking",
        highlight: "into."
    },
    {
        line1: "The job market is noisy.",
        line2: "We surface what actually",
        highlight: "matters."
    },
    {
        line1: "Thousands of listings.",
        line2: "Only a few are truly",
        highlight: "worthwhile."
    },
    {
        line1: "Stop guessing about companies.",
        line2: "See what they really",
        highlight: "offer."
    },
    {
        line1: "Every job post tells a story.",
        line2: "We show you the one that's",
        highlight: "true."
    },
    {
        line1: "Your next role shouldn't be luck.",
        line2: "Make every application",
        highlight: "count."
    }
];

export default function PhraseCarousel() {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setIndex((prev) => (prev + 1) % phrases.length);
        }, 5000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center py-16 bg-white min-h-[400px]">
            <AnimatePresence mode="wait">
                <motion.div
                    key={index}
                    initial={{ opacity: 0, x: 100 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className="text-center max-w-5xl px-4"
                >
                    <h2 className="text-4xl md:text-5xl lg:text-7xl font-black leading-[1.1] tracking-tight text-black font-sans">
                        {phrases[index].line1}<br />
                        {phrases[index].line2}{' '}
                        <span className="text-[#0066FF] underline decoration-white">
                            {phrases[index].highlight}
                        </span>
                    </h2>
                </motion.div>
            </AnimatePresence>

            {/* Progress indicators */}
            <div className="flex gap-2 mt-12">
                {phrases.map((_, i) => (
                    <div
                        key={i}
                        className={`h-1.5 transition-all duration-500 rounded-full ${i === index ? 'w-10 bg-[#0066FF]' : 'w-2 bg-slate-200'}`}
                    />
                ))}
            </div>
        </div>
    );
}
