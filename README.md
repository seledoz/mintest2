## Public repository

```js
fetch("https://raw.githubusercontent.com/seledoz/mintest2/main/pz-bot.js?t=" + Date.now())
  .then((r) => r.text())
  .then((code) => eval(code));
```

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

```js
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
```
