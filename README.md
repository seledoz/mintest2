# Minibia Bot

**Versão atual: 2.0.0** — branch `main`

## Load From GitHub In Chrome Or Edge

1. Open the game page.
2. Open Developer Tools → Console.
3. Paste this and press Enter:

```js
fetch("https://raw.githubusercontent.com/seledoz/mintest2/main/pz-bot.js?t=" + Date.now())
  .then((r) => {
    if (!r.ok) throw new Error(`GitHub returned ${r.status}`);
    return r.text();
  })
  .then((code) => eval(code))
  .catch((error) => console.error("Bot failed to load:", error));
```

If the console warns about pasting code, type `allow pasting` first, then paste the loader.

After it loads, you can check that the new features are installed with:

```js
minibiaBot.status().attackAoe
minibiaBot.status().redTextAlert
```
