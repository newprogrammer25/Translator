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
    # Major world languages
    Language("en-US", "en", "English", "English", "🇺🇸"),
    Language("en-GB", "en-GB", "English (UK)", "English (UK)", "🇬🇧"),
    Language("zh-CN", "zh", "Chinese (Simplified)", "中文(简体)", "🇨🇳"),
    Language("zh-TW", "zh-TW", "Chinese (Traditional)", "中文(繁體)", "🇹🇼"),
    Language("es-ES", "es", "Spanish", "Español", "🇪🇸"),
    Language("es-MX", "es-MX", "Spanish (Mexico)", "Español (México)", "🇲🇽"),
    Language("fr-FR", "fr", "French", "Français", "🇫🇷"),
    Language("de-DE", "de", "German", "Deutsch", "🇩🇪"),
    Language("ru-RU", "ru", "Russian", "Русский", "🇷🇺"),
    Language("pt-BR", "pt", "Portuguese (Brazil)", "Português (Brasil)", "🇧🇷"),
    Language("pt-PT", "pt-PT", "Portuguese (Portugal)", "Português (Portugal)", "🇵🇹"),
    Language("ja-JP", "ja", "Japanese", "日本語", "🇯🇵"),
    Language("ko-KR", "ko", "Korean", "한국어", "🇰🇷"),
    Language("ar-SA", "ar", "Arabic", "العربية", "🇸🇦"),
    Language("hi-IN", "hi", "Hindi", "हिन्दी", "🇮🇳"),
    Language("it-IT", "it", "Italian", "Italiano", "🇮🇹"),
    Language("tr-TR", "tr", "Turkish", "Türkçe", "🇹🇷"),
    Language("nl-NL", "nl", "Dutch", "Nederlands", "🇳🇱"),
    Language("pl-PL", "pl", "Polish", "Polski", "🇵🇱"),
    Language("uk-UA", "uk", "Ukrainian", "Українська", "🇺🇦"),
    Language("sv-SE", "sv", "Swedish", "Svenska", "🇸🇪"),
    Language("da-DK", "da", "Danish", "Dansk", "🇩🇰"),
    Language("no-NO", "no", "Norwegian", "Norsk", "🇳🇴"),
    Language("fi-FI", "fi", "Finnish", "Suomi", "🇫🇮"),
    Language("ro-RO", "ro", "Romanian", "Română", "🇷🇴"),
    Language("hu-HU", "hu", "Hungarian", "Magyar", "🇭🇺"),
    Language("cs-CZ", "cs", "Czech", "Čeština", "🇨🇿"),
    Language("sk-SK", "sk", "Slovak", "Slovenčina", "🇸🇰"),
    Language("bg-BG", "bg", "Bulgarian", "Български", "🇧🇬"),
    Language("hr-HR", "hr", "Croatian", "Hrvatski", "🇭🇷"),
    Language("sr-RS", "sr", "Serbian", "Српски", "🇷🇸"),
    Language("el-GR", "el", "Greek", "Ελληνικά", "🇬🇷"),
    Language("he-IL", "he", "Hebrew", "עברית", "🇮🇱"),
    Language("th-TH", "th", "Thai", "ไทย", "🇹🇭"),
    Language("vi-VN", "vi", "Vietnamese", "Tiếng Việt", "🇻🇳"),
    Language("id-ID", "id", "Indonesian", "Bahasa Indonesia", "🇮🇩"),
    Language("ms-MY", "ms", "Malay", "Bahasa Melayu", "🇲🇾"),
    Language("tl-PH", "tl", "Filipino", "Filipino", "🇵🇭"),
    Language("bn-BD", "bn", "Bengali", "বাংলা", "🇧🇩"),
    Language("ta-IN", "ta", "Tamil", "தமிழ்", "🇮🇳"),
    Language("ur-PK", "ur", "Urdu", "اردو", "🇵🇰"),
    Language("fa-IR", "fa", "Persian", "فارسی", "🇮🇷"),
    Language("sw-KE", "sw", "Swahili", "Kiswahili", "🇰🇪"),
    Language("af-ZA", "af", "Afrikaans", "Afrikaans", "🇿🇦"),
    Language("ka-GE", "ka", "Georgian", "ქართული", "🇬🇪"),
    Language("az-AZ", "az", "Azerbaijani", "Azərbaycan", "🇦🇿"),
    Language("kk-KZ", "kk", "Kazakh", "Қазақша", "🇰🇿"),
    Language("uz-UZ", "uz", "Uzbek", "O'zbek", "🇺🇿"),
)


def find_language(code: str) -> Language | None:
    code_lower = code.lower()
    for lang in LANGUAGES:
        if lang.code.lower() == code_lower or lang.iso.lower() == code_lower:
            return lang
    return None
