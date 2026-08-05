window.__minibiaBotBundle = window.__minibiaBotBundle || {};

// Profiles UI and storage are installed by the post-main standalone profile
// controller in github-waypoint-delete-button.js. Keep this compatibility
// installer so older code can safely call it without creating a second panel
// or attaching competing dropdown refresh handlers.
window.__minibiaBotBundle.installProfilesModule = function installProfilesModule(bot) {
  return bot?.profiles || null;
};
