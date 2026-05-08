"""Supported languages catalog.

Codes follow BCP-47 / ISO-639-1 where possible so that the browser's
``SpeechRecognition`` and ``SpeechSynthesis`` APIs can use them directly.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Language:
    code: str  # BCP-47 (e.g. "en-US")
    iso: str  # ISO-639-1 (e.g. "en")
    name: str  # English name
    native: str  # Endonym
    flag: str  # Emoji flag


LANGUAGES: tuple[Language, ...] = (
    Language("auto", "auto", "Auto-detect", "Auto-detect", "🌐"),
    Language("en-US", "en", "English", "English", "🇺🇸"),
    Language("ru-RU", "ru", "Russian", "Русский", "🇷🇺"),
    Language("zh-CN", "zh", "Chinese (Simplified)", "中文", "🇨🇳"),
    Language("es-ES", "es", "Spanish", "Español", "🇪🇸"),
    Language("fr-FR", "fr", "French", "Français", "🇫🇷"),
    Language("de-DE", "de", "German", "Deutsch", "🇩🇪"),
    Language("it-IT", "it", "Italian", "Italiano", "🇮🇹"),
    Language("pt-BR", "pt", "Portuguese", "Português", "🇧🇷"),
    Language("ja-JP", "ja", "Japanese", "日本語", "🇯🇵"),
    Language("ko-KR", "ko", "Korean", "한국어", "🇰🇷"),
    Language("ar-SA", "ar", "Arabic", "العربية", "🇸🇦"),
    Language("hi-IN", "hi", "Hindi", "हिन्दी", "🇮🇳"),
    Language("tr-TR", "tr", "Turkish", "Türkçe", "🇹🇷"),
    Language("uk-UA", "uk", "Ukrainian", "Українська", "🇺🇦"),
    Language("pl-PL", "pl", "Polish", "Polski", "🇵🇱"),
    Language("nl-NL", "nl", "Dutch", "Nederlands", "🇳🇱"),
    Language("sv-SE", "sv", "Swedish", "Svenska", "🇸🇪"),
    Language("vi-VN", "vi", "Vietnamese", "Tiếng Việt", "🇻🇳"),
    Language("th-TH", "th", "Thai", "ไทย", "🇹🇭"),
    Language("id-ID", "id", "Indonesian", "Bahasa Indonesia", "🇮🇩"),
    Language("he-IL", "he", "Hebrew", "עברית", "🇮🇱"),
    Language("cs-CZ", "cs", "Czech", "Čeština", "🇨🇿"),
    Language("el-GR", "el", "Greek", "Ελληνικά", "🇬🇷"),
)


def find_language(code: str) -> Language | None:
    code_lower = code.lower()
    for lang in LANGUAGES:
        if lang.code.lower() == code_lower or lang.iso.lower() == code_lower:
            return lang
    return None
