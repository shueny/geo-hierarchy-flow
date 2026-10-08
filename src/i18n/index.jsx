import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { messages } from "./messages";

const LangContext = createContext(null);
const STORAGE_KEY = "dc-globe-demo.lang";

const readStored = () => {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "zh" || v === "en" ? v : null;
  } catch {
    return null;
  }
};

const detect = () =>
  readStored() || ((navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en");

// "{n}" inserts a value; "{n|hall|halls}" picks singular/plural by n
export const format = (str, vars) =>
  vars
    ? str
      .replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (_, k, one, other) => (Number(vars[k]) === 1 ? one : other))
      .replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`))
    : str;

export const LangProvider = ({ children }) => {
  const [lang, setLang] = useState(detect);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en";
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* private mode: the toggle still works for this visit */
    }
  }, [lang]);

  const value = useMemo(() => {
    const dict = messages[lang];
    return {
      lang,
      setLang,
      // t("key", { n: 3 }) — falls back to English, then to the key itself
      t: (key, vars) => format(dict[key] ?? messages.en[key] ?? key, vars),
      // pick({ zh, en }) for bilingual data fields
      pick: (field) => (field && typeof field === "object" ? field[lang] ?? field.en : field),
    };
  }, [lang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
};

export const useLang = () => useContext(LangContext);
