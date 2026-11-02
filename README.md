## Public repository (adaptive client test build)

**Use the test branch URL below. Do not use `main` yet.** The adaptive client and compatibility bridge changes are saved on `adaptive/structural-client-capture`; they have not been merged into `main`.

Open Minibia, wait until your character is fully logged in and the game world is visible, then run this in the game page's browser console:

```js
fetch("https://raw.githubusercontent.com/seledoz/mintest2/adaptive/structural-client-capture/pz-bot.js?t=" + Date.now(), {
  cache: "no-store"
})
  .then((response) => {
    if (!response.ok) throw new Error(`MinTest2 loader HTTP ${response.status}`);
    return response.text();
  })
  .then((code) => {
    (0, eval)(code);
    return window.__minibiaBotLoadPromise;
  })
  .catch((error) => {
    console.error("[minibia-bot] Loader failed", error);
    throw error;
  });
```

Wait for the loader promise to settle. A console entry showing `Promise {<pending>}` is normal while loading and is not, by itself, confirmation that the bot loaded. A successful load prints a message beginning with `[minibia-bot] Loaded source files`.

### Current test status

- Adaptive client discovery successfully captured the client, world, pathfinder, packet dispatcher, AutoWalk constructor, and StopWalk constructor across two different scrambler runs.
- Healing and rune making have been reported working on the adaptive test build.
- **Cavebot is currently not working on this build.** Do not treat this branch as a complete replacement for the stable `main` build yet.
- Keep testing and fixes on `adaptive/structural-client-capture`. Do not merge it into `main` until cavebot is repaired and retested.

If you accidentally load the `main` URL while testing this branch, you will get the older loader/compatibility bridge combination. Use the branch URL above for adaptive-build testing.

## Private repository

Use a fine-grained GitHub token with read and write access to the repository contents.

```js
(async () => {
  const token = prompt("Paste your GitHub token:")?.trim();
  if (!token) return;

  const repository = "seledoz/mintest2";
  const legacyRepository = "seledoz/Min-new";
  const ref = "main";
  const rawPrefix = `https://raw.githubusercontent.com/${repository}/${ref}/`;
  const legacyRawPrefix = `https://raw.githubusercontent.com/${legacyRepository}/${ref}/`;
  const apiPrefix = `https://api.github.com/repos/${repository}/contents`;
  const legacyApiPrefix = `https://api.github.com/repos/${legacyRepository}/contents`;
  const originalFetch = window.fetch.bind(window);

  function githubHeaders(existingHeaders, accept = "application/vnd.github+json") {
    const headers = new Headers(existingHeaders || {});
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", accept);
    headers.set("X-GitHub-Api-Version", "2022-11-28");
    return headers;
  }

  function rawToApi(url, prefix) {
    const path = url.slice(prefix.length).split("?")[0];
    return `${apiPrefix}/${path}?ref=${encodeURIComponent(ref)}&t=${Date.now()}`;
  }

  // Authenticate all mintest2 GitHub requests and transparently redirect
  // leftover Min-new waypoint-library requests to mintest2.
  window.fetch = function authenticatedPrivateRepoFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url;
    if (!url) return originalFetch(input, init);

    let nextUrl = url;
    let accept = "application/vnd.github+json";

    if (url.startsWith(rawPrefix)) {
      nextUrl = rawToApi(url, rawPrefix);
      accept = "application/vnd.github.raw+json";
    } else if (url.startsWith(legacyRawPrefix)) {
      nextUrl = rawToApi(url, legacyRawPrefix);
      accept = "application/vnd.github.raw+json";
    } else if (url.startsWith(legacyApiPrefix)) {
      nextUrl = apiPrefix + url.slice(legacyApiPrefix.length);
    } else if (!url.startsWith(apiPrefix)) {
      return originalFetch(input, init);
    }

    return originalFetch(nextUrl, {
      ...init,
      headers: githubHeaders(init.headers, accept),
      cache: "no-store",
    });
  };

  const response = await originalFetch(
    `${apiPrefix}/pz-bot.js?ref=${encodeURIComponent(ref)}&t=${Date.now()}`,
    {
      headers: githubHeaders(undefined, "application/vnd.github.raw+json"),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub fetch failed: ${response.status} ${response.statusText}`);
  }

  window.eval(await response.text());
})();
```
