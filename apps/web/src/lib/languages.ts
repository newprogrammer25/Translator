import type { Language } from "./types";

/** Bundled fallback list — used if /api/languages cannot be reached. Keep in sync with apps/server/app/languages.py */
export const BUNDLED_LANGUAGES: Language[] = [
  { code: "auto", iso: "auto", name: "Auto-detect", native: "Auto-detect", flag: "🌐" },
  { code: "en-US", iso: "en", name: "English", native: "English", flag: "🇺🇸" },
  { code: "ru-RU", iso: "ru", name: "Russian", native: "Русский", flag: "🇷🇺" },
  { code: "zh-CN", iso: "zh", name: "Chinese (Simplified)", native: "中文", flag: "🇨🇳" },
  { code: "es-ES", iso: "es", name: "Spanish", native: "Español", flag: "🇪🇸" },
  { code: "fr-FR", iso: "fr", name: "French", native: "Français", flag: "🇫🇷" },
  { code: "de-DE", iso: "de", name: "German", native: "Deutsch", flag: "🇩🇪" },
  { code: "it-IT", iso: "it", name: "Italian", native: "Italiano", flag: "🇮🇹" },
  { code: "pt-BR", iso: "pt", name: "Portuguese", native: "Português", flag: "🇧🇷" },
  { code: "ja-JP", iso: "ja", name: "Japanese", native: "日本語", flag: "🇯🇵" },
  { code: "ko-KR", iso: "ko", name: "Korean", native: "한국어", flag: "🇰🇷" },
  { code: "ar-SA", iso: "ar", name: "Arabic", native: "العربية", flag: "🇸🇦" },
  { code: "hi-IN", iso: "hi", name: "Hindi", native: "हिन्दी", flag: "🇮🇳" },
  { code: "tr-TR", iso: "tr", name: "Turkish", native: "Türkçe", flag: "🇹🇷" },
  { code: "uk-UA", iso: "uk", name: "Ukrainian", native: "Українська", flag: "🇺🇦" },
  { code: "pl-PL", iso: "pl", name: "Polish", native: "Polski", flag: "🇵🇱" },
  { code: "nl-NL", iso: "nl", name: "Dutch", native: "Nederlands", flag: "🇳🇱" },
  { code: "sv-SE", iso: "sv", name: "Swedish", native: "Svenska", flag: "🇸🇪" },
  { code: "vi-VN", iso: "vi", name: "Vietnamese", native: "Tiếng Việt", flag: "🇻🇳" },
  { code: "th-TH", iso: "th", name: "Thai", native: "ไทย", flag: "🇹🇭" },
  { code: "id-ID", iso: "id", name: "Indonesian", native: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "he-IL", iso: "he", name: "Hebrew", native: "עברית", flag: "🇮🇱" },
  { code: "cs-CZ", iso: "cs", name: "Czech", native: "Čeština", flag: "🇨🇿" },
  { code: "el-GR", iso: "el", name: "Greek", native: "Ελληνικά", flag: "🇬🇷" },
];
