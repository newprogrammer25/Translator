import type { Language } from "../lib/types";

interface Props {
  value: string;
  onChange: (code: string) => void;
  languages: Language[];
  excludeAuto?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Premium pill-style language picker. Keeps a real `<select>` so the native OS
 * picker appears on mobile (much better UX on iOS/Android than a custom
 * dropdown) but styles it as a glassy pill with chevron.
 */
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
      className={`select-pill ${className ?? ""}`}
    >
      {list.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.flag} {lang.native}
        </option>
      ))}
    </select>
  );
}
