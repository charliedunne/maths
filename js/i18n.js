/* Mates — i18n helper.
 * t(key) resolves a key against the active language catalog,
 * falling back to English, then to the raw key (so missing
 * keys are visible during development instead of blank).
 * t(key, vars) interpolates {name} tokens. */
window.Mates = window.Mates || {};

Mates.t = function (key, vars) {
  const catalogs = window.I18N || {};
  let text = null;

  if (Mates.settings && Mates.settings.language && catalogs[Mates.settings.language]) {
    text = catalogs[Mates.settings.language][key];
  }
  if (text === undefined || text === null) {
    text = catalogs.en ? catalogs.en[key] : undefined;
  }
  if (text === undefined || text === null) {
    return key;
  }

  if (vars) {
    Object.keys(vars).forEach(function (k) {
      text = text.split('{' + k + '}').join(String(vars[k]));
    });
  }
  return text;
};
