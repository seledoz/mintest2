window.__minibiaBotBundle = window.__minibiaBotBundle || {};

// Fireball 2.0 was removed. Keep a no-op installer so existing loaders that
// still reference the symbol can boot without exposing or running the module.
window.__minibiaBotBundle.installFireballV2Module = function installFireballV2Module() {
  return null;
};
