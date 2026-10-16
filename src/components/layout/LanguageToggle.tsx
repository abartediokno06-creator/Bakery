import { useT, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const OPTIONS: ReadonlyArray<{ value: Lang; label: string; name: string }> = [
  { value: "en", label: "EN", name: "English" },
  { value: "tl", label: "TL", name: "Tagalog" },
];

/** English / Tagalog switch. `onDark` styles it for the green header. */
export function LanguageToggle({ onDark = false }: { onDark?: boolean }) {
  const { lang, setLang } = useT();
  return (
    <div
      role="group"
      aria-label="Language / Wika"
      className={cn("flex rounded-full p-0.5", onDark ? "bg-white/15" : "bg-surface ring-1 ring-line")}
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={lang === o.value}
          aria-label={o.name}
          onClick={() => setLang(o.value)}
          className={cn(
            "h-8 min-w-[40px] rounded-full px-2 text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2",
            onDark ? "focus-visible:ring-gold" : "focus-visible:ring-brand",
            lang === o.value
              ? onDark ? "bg-white text-brand-dark" : "bg-brand text-white"
              : onDark ? "text-white hover:bg-white/10" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
