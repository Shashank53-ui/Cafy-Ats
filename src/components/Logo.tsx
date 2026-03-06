export default function Logo({ className = "w-8 h-8" }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Thick outer blue ring */}
            <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="12" />
            {/* Elegant swooshing arrow pointing top right */}
            <path
                d="M26 56 Q 50 35 72 32 Q 52 50 46 72"
                stroke="currentColor"
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </svg>
    );
}
