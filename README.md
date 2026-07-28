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
  const token = prompt("Paste your GitHub read-only token:");
  if (!token) return;

  const response = await fetch(
    "https://api.github.com/repos/seledoz/mintest2/contents/pz-bot.js?ref=main&t=" + Date.now(),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.raw+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub fetch failed: ${response.status} ${response.statusText}`);
  }

  const code = await response.text();
  window.eval(code);
})();
```

Do not save your GitHub token in this README, in `pz-bot.js`, or anywhere else in the repository.