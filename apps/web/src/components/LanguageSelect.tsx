import type { Language } from "../lib/types";

interface Props {
  value: string;
  onChange: (code: string) => void;
  languages: Language[];
  excludeAuto?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function LanguageSelect({
  value,
  onChange,
  languages,
  excludeAuto,
  className,
  ariaLabel,
}: Props) {
  const list = excludeAuto ? languages.filter((l) => l.code !== "auto") : languages;
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-ink-900/80 border border-ink-700 rounded-lg px-3 py-2 text-sm
        text-ink-100 focus:outline-none focus:ring-2 focus:ring-brand-500/60 focus:border-brand-500/60
        appearance-none ${className ?? ""}`}
    >
      {list.map((lang) => (
        <option key={lang.code} value={lang.code} className="bg-ink-900">
          {lang.flag} {lang.native}
        </option>
      ))}
    </select>
  );
}
