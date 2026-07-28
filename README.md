## Public repository

```js
fetch("https://raw.githubusercontent.com/seledoz/mintest2/main/pz-bot.js?t=" + Date.now())
  .then((r) => r.text())
  .then((code) => eval(code));
```

## Private repository

Use a fine-grained GitHub token with read-only access to the repository contents.

```js
(async () => {
  const token = prompt("Paste your GitHub read-only token:")?.trim();
  if (!token) return;

  const repository = "seledoz/mintest2";
  const ref = "main";
  const rawPrefix = `https://raw.githubusercontent.com/${repository}/${ref}/`;
  const originalFetch = window.fetch.bind(window);

  function githubHeaders(existingHeaders) {
    const headers = new Headers(existingHeaders || {});
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/vnd.github.raw+json");
    headers.set("X-GitHub-Api-Version", "2022-11-28");
    return headers;
  }

  // pz-bot.js normally loads its modules from raw.githubusercontent.com.
  // Redirect those requests through GitHub's authenticated Contents API.
  window.fetch = function authenticatedPrivateRepoFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url;

    if (url?.startsWith(rawPrefix)) {
      const path = url.slice(rawPrefix.length).split("?")[0];
      const apiUrl =
        `https://api.github.com/repos/${repository}/contents/${path}` +
        `?ref=${encodeURIComponent(ref)}&t=${Date.now()}`;

      return originalFetch(apiUrl, {
        ...init,
        headers: githubHeaders(init.headers),
        cache: "no-store",
      });
    }

    return originalFetch(input, init);
  };

  const response = await originalFetch(
    `https://api.github.com/repos/${repository}/contents/pz-bot.js?ref=${encodeURIComponent(ref)}&t=${Date.now()}`,
    {
      headers: githubHeaders(),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub fetch failed: ${response.status} ${response.statusText}`);
  }

  window.eval(await response.text());
})();
```

Paste the entire code block into the browser console, press Enter, and then paste the token into the popup prompt.

Do not save your GitHub token in this README, in `pz-bot.js`, or anywhere else in the repository.
