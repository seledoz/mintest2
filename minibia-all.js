(() => {
  const runtimeUrl = "https://raw.githubusercontent.com/seledoz/mintest2/main/pz-bot.js";
  const script = document.createElement("script");
  script.src = `${runtimeUrl}?t=${Date.now()}`;
  script.async = false;
  script.onload = () => console.log("[minibia-bot] Loaded pz-bot runtime loader");
  script.onerror = (error) => console.error("[minibia-bot] Failed to load pz-bot runtime loader", error);
  (document.head || document.documentElement).appendChild(script);
})();
