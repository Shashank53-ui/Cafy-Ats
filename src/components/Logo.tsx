export default function Logo({ className = "w-8 h-8 object-contain" }: { className?: string }) {
    return (
        <img
            src="/logo2.png"
            alt="GetLanded Logo"
            className={className}
        />
    );
}
