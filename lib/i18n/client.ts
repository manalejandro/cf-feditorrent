"use client"
import { useState, useEffect } from "react";
import { dicts, type Locale, type Dict } from "./dict";

function getStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem("ft_locale") as Locale | null;
  if (stored === "en" || stored === "es") return stored;
  return navigator.language?.startsWith("es") ? "es" : "en";
}

export function useLocale(): [Locale, (l: Locale) => void, Dict] {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the stored locale after mount
    setLocaleState(getStoredLocale());
  }, []);

  const setLocale = (l: Locale) => {
    localStorage.setItem("ft_locale", l);
    document.cookie = `ft_locale=${l};path=/;max-age=31536000;SameSite=Lax`;
    setLocaleState(l);
  };

  return [locale, setLocale, dicts[locale]];
}
