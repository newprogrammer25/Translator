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
 * Premium language picker — uses native <select> for mobile sheet UX,
 * styled as a pill with flag + name.
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
      className={`select-pill w-full ${className ?? ""}`}
    >
      {list.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.flag} {lang.native}
        </option>
      ))}
    </select>
  );
}
