import { useState, useEffect, useRef } from "react";
import { api } from "../../api";

export const BROWSER_LABELS = {
  brave: "Brave", chrome: "Chrome", chromium: "Chromium",
  edge: "Edge", firefox: "Firefox", vivaldi: "Vivaldi", opera: "Opera",
};

async function importCookiesImpl(browser, setters, addToast) {
  setters.setImportingBrowser(browser);
  try {
    const res = await api.importCookies(browser);
    addToast(`✅ ${res.message}`);
    await setters.loadStatus();
  } catch (e) {
    addToast("❌ " + e.message);
  } finally {
    setters.setImportingBrowser(null);
  }
}

async function uploadCookieFileImpl(file, loadStatus, addToast) {
  if (!file) return;
  try {
    const res = await api.uploadCookies(file);
    addToast(`✅ ${res.message}`);
    await loadStatus();
  } catch (e) {
    addToast("❌ " + e.message);
  }
}

async function deleteCookiesImpl(loadStatus, addToast) {
  await api.deleteCookies();
  addToast("Cookie eliminati");
  await loadStatus();
}

/** Import automatico dal browser del server, upload manuale del file, cancellazione. */
export function useCookieManagement(loadStatus, addToast) {
  const [cookieDrag, setCookieDrag] = useState(false);
  const [detectedBrowsers, setDetectedBrowsers] = useState(null); // null = ancora in rilevamento
  const [importingBrowser, setImportingBrowser] = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    api.cookieBrowsers().then(d => setDetectedBrowsers(d.browsers || [])).catch(() => setDetectedBrowsers([]));
  }, []);

  const setters = { setImportingBrowser, loadStatus };
  const handleImportCookies = browser => importCookiesImpl(browser, setters, addToast);
  const handleCookieFile = file => uploadCookieFileImpl(file, loadStatus, addToast);
  const handleDeleteCookies = () => deleteCookiesImpl(loadStatus, addToast);

  return {
    cookieDrag, setCookieDrag, detectedBrowsers, importingBrowser, fileRef,
    handleImportCookies, handleCookieFile, handleDeleteCookies,
  };
}
