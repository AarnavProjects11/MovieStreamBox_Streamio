// Audio-language and subtitle detection shared by every provider.
//
// Sources advertise this in free-form labels — 4KHDHub shows "Hindi, English"
// badges, scene filenames carry "MULTi" / "DDP5.1 HIN+ENG", and Stremio add-ons
// put a language list in the stream title. None of them use a schema, so all of
// this is best-effort pattern matching over the text we already have.

/** Languages the UI can recognise, in the order they are shown in filters. */
export const AUDIO_LANGUAGES = [
  "English",
  "Hindi",
  "Tamil",
  "Telugu",
  "Malayalam",
  "Kannada",
  "Bengali",
  "Marathi",
  "Punjabi",
  "Gujarati",
  "Urdu",
  "Korean",
  "Japanese",
  "Chinese",
  "French",
  "Spanish",
  "German",
  "Italian",
  "Portuguese",
  "Russian",
  "Arabic",
  "Turkish",
  "Thai",
  "Vietnamese",
  "Dutch",
  "Polish",
  "Swedish",
  "Danish",
  "Norwegian",
  "Finnish",
  "Czech",
  "Hungarian",
  "Greek",
  "Hebrew",
  "Indonesian",
  "Ukrainian",
  "Romanian",
] as const;

export type AudioLanguage = (typeof AUDIO_LANGUAGES)[number];

/** Three-letter codes only — two-letter ones collide with ordinary English words. */
const ISO_CODES: Record<string, AudioLanguage> = {
  eng: "English",
  hin: "Hindi",
  tam: "Tamil",
  tel: "Telugu",
  mal: "Malayalam",
  kan: "Kannada",
  ben: "Bengali",
  mar: "Marathi",
  pun: "Punjabi",
  guj: "Gujarati",
  urd: "Urdu",
  kor: "Korean",
  jpn: "Japanese",
  chi: "Chinese",
  zho: "Chinese",
  fre: "French",
  fra: "French",
  spa: "Spanish",
  ger: "German",
  deu: "German",
  ita: "Italian",
  por: "Portuguese",
  rus: "Russian",
  ara: "Arabic",
  tur: "Turkish",
  tha: "Thai",
  vie: "Vietnamese",
  dut: "Dutch",
  nld: "Dutch",
  pol: "Polish",
  swe: "Swedish",
  dan: "Danish",
  nor: "Norwegian",
  fin: "Finnish",
  cze: "Czech",
  hun: "Hungarian",
  gre: "Greek",
  heb: "Hebrew",
  ind: "Indonesian",
  ukr: "Ukrainian",
  rum: "Romanian",
};

const LANGUAGE_PATTERNS = AUDIO_LANGUAGES.map((lang) => ({
  lang,
  // Word-boundary match; the text is padded so boundaries work at the edges.
  re: new RegExp(`(^|[^a-z])${lang.toLowerCase()}([^a-z]|$)`),
}));

/**
 * Returns the audio languages mentioned in a label, canonicalised and deduped.
 * `"Hindi| English"`, `"HIN + ENG"` and `"Multi Audio [Hindi, Tamil]"` all work.
 */
export function detectLanguages(text: string): AudioLanguage[] {
  const raw = String(text ?? "");
  if (!raw) return [];
  const lower = ` ${raw.toLowerCase()} `;
  const found = new Set<AudioLanguage>();

  for (const { lang, re } of LANGUAGE_PATTERNS) {
    if (re.test(lower)) found.add(lang);
  }
  for (const token of lower.split(/[^a-z]+/)) {
    const canonical = ISO_CODES[token];
    if (canonical) found.add(canonical);
  }

  // Keep the canonical order so filters do not reshuffle between renders.
  return AUDIO_LANGUAGES.filter((lang) => found.has(lang));
}

/** `true` when the label says the release carries more than one audio track. */
export function detectMultiAudio(text: string): boolean {
  return /\b(?:multi[\s._-]?audio|dual[\s._-]?audio|multi)\b/i.test(String(text ?? ""));
}

/** `true` when the label suggests subtitles are included. */
export function detectSubtitles(text: string): boolean {
  return /\b(?:multi|subs?|subbed|esubs?|softsubs?|hardsubs?|srt)\b/i.test(String(text ?? ""));
}

/** Human label for the pseudo "multi audio" filter entry. */
export const MULTI_AUDIO_LABEL = "Multi Audio";

/** BCP-47 codes used by `<track srcLang>` and the browser caption menu. */
const LANGUAGE_CODES: Record<string, string> = {
  English: "en",
  Hindi: "hi",
  Tamil: "ta",
  Telugu: "te",
  Malayalam: "ml",
  Kannada: "kn",
  Bengali: "bn",
  Marathi: "mr",
  Punjabi: "pa",
  Gujarati: "gu",
  Urdu: "ur",
  Korean: "ko",
  Japanese: "ja",
  Chinese: "zh",
  French: "fr",
  Spanish: "es",
  German: "de",
  Italian: "it",
  Portuguese: "pt",
  Russian: "ru",
  Arabic: "ar",
  Turkish: "tr",
  Thai: "th",
  Vietnamese: "vi",
  Dutch: "nl",
  Polish: "pl",
  Swedish: "sv",
  Danish: "da",
  Norwegian: "no",
  Finnish: "fi",
  Czech: "cs",
  Hungarian: "hu",
  Greek: "el",
  Hebrew: "he",
  Indonesian: "id",
  Ukrainian: "uk",
  Romanian: "ro",
};

export function languageCode(label: string): string {
  return LANGUAGE_CODES[label] ?? label.slice(0, 2).toLowerCase();
}

/**
 * Language tags shown on a stream and offered in the filter.
 * Explicit languages win; a bare "MULTi" release is tagged as multi-audio.
 */
export function streamLanguageTags(text: string): string[] {
  const explicit = detectLanguages(text);
  if (explicit.length) return explicit;
  return detectMultiAudio(text) ? [MULTI_AUDIO_LABEL] : [];
}
