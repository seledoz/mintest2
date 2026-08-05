(() => {
  const BUTTON_ID = "minibia-bot-github-waypoints-delete";
  const SECTION_ID = "minibia-bot-github-waypoints-section";
  const SELECT_ID = "minibia-bot-github-waypoints-select";
  const STATUS_ID = "minibia-bot-github-waypoints-status";
  const TOKEN_KEY = "minibiaBot.github.token";
  const REPO_OWNER = "seledoz";
  const REPO_NAME = "mintest2";
  const BRANCH = "main";
  const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;

  function setStatus(message) {
    const label = document.getElementById(STATUS_ID);
    if (label) label.textContent = `GitHub: ${message}`;
  }

  function getToken() {
    try {
      const raw = window.localStorage.getItem(TOKEN_KEY);
      if (!raw) return "";
      try { return String(JSON.parse(raw) || "").trim(); } catch (error) { return String(raw || "").trim(); }
    } catch (error) {
      return "";
    }
  }

  function encodePath(path) {
    return String(path || "").split("/").map((part) => encodeURIComponent(part)).join("/");
  }

  function headers(token) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    };
  }

  async function readFile(path, token) {
    const response = await fetch(`${API_BASE}/${encodePath(path)}?ref=${encodeURIComponent(BRANCH)}`, {
      headers: headers(token),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`read failed (${response.status})`);
    return response.json();
  }

  async function deleteFile(path, name, sha, token) {
    const response = await fetch(`${API_BASE}/${encodePath(path)}`, {
      method: "DELETE",
      headers: headers(token),
      body: JSON.stringify({
        message: `Delete waypoint script: ${name}`,
        sha,
        branch: BRANCH,
      }),
    });
    if (!response.ok) {
      let detail = "";
      try { detail = (await response.json())?.message || ""; } catch (error) {}
      throw new Error(`delete failed (${response.status})${detail ? ` - ${detail}` : ""}`);
    }
  }

  function selectedName(select) {
    const label = select?.options?.[select.selectedIndex]?.textContent || "selected script";
    return label.replace(/\s*\(\d+\)\s*$/, "").trim() || "selected script";
  }

  function injectDeleteButton() {
    const section = document.getElementById(SECTION_ID);
    const select = document.getElementById(SELECT_ID);
    if (!section || !select) return false;
    if (document.getElementById(BUTTON_ID)) return true;

    const button = document.createElement("button");
    button.type = "button";
    button.id = BUTTON_ID;
    button.className = "mb-small-button";
    button.textContent = "Delete Selected";

    const refreshButton = document.getElementById("minibia-bot-github-waypoints-refresh");
    if (refreshButton) refreshButton.insertAdjacentElement("beforebegin", button);
    else section.querySelector(".mb-stack")?.appendChild(button);

    const syncDisabled = () => {
      button.disabled = !select.value || select.disabled;
    };
    select.addEventListener("change", syncDisabled);
    syncDisabled();

    button.addEventListener("click", async () => {
      const path = String(select.value || "").trim();
      const name = selectedName(select);
      if (!path) return;

      const token = getToken();
      if (!token) {
        setStatus("Save GitHub Setup first");
        return;
      }

      if (!window.confirm(`Delete GitHub waypoint script “${name}”?\n\nThis cannot be undone.`)) return;

      button.disabled = true;
      setStatus(`deleting ${name}...`);
      try {
        const file = await readFile(path, token);
        if (!file?.sha) throw new Error("file SHA missing");
        await deleteFile(path, name, file.sha, token);
        setStatus(`deleted ${name}`);
        await window.minibiaBot?.githubWaypointLibrary?.refreshUi?.();
      } catch (error) {
        setStatus(error?.message || String(error));
        console.error("[minibia-bot] GitHub waypoint delete failed", error);
      } finally {
        syncDisabled();
      }
    });

    return true;
  }

  injectDeleteButton();
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (injectDeleteButton() || attempts >= 80) window.clearInterval(timer);
  }, 250);
})();
