const card = document.getElementById("card");
const input = document.getElementById("password");
const errorEl = document.getElementById("error");
const submitBtn = document.getElementById("submitBtn");

card.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  card.classList.remove("shake");
  submitBtn.disabled = true;

  try {
    const res = await fetch("api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: input.value })
    });
    if (res.ok) {
      card.classList.add("success");
      setTimeout(() => { window.location.href = "index.html"; }, 550);
      return;
    }
    throw new Error("denied");
  } catch (e) {
    void card.offsetWidth;
    card.classList.add("shake");
    errorEl.textContent = "ACCESS DENIED — INVALID PASSCODE";
    input.value = "";
    input.focus();
    submitBtn.disabled = false;
  }
});

/* ---------- Theme switch ---------- */
const THEME_KEY = "wt-login-theme";
const themeToggle = document.getElementById("themeToggle");

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggle.querySelectorAll(".opt").forEach((el) => {
    el.classList.toggle("active", el.dataset.themeOpt === theme);
  });
  matrix.running = theme === "terminal";
  if (matrix.running) matrix.start(); else matrix.stop();
}

themeToggle.addEventListener("click", (e) => {
  const opt = e.target.closest(".opt");
  if (!opt) return;
  const theme = opt.dataset.themeOpt;
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
});

/* ---------- Matrix rain effect ---------- */
const matrix = (() => {
  const canvas = document.getElementById("matrix");
  const ctx = canvas.getContext("2d");
  const chars = "アイウエオカキクケコサシスセソ0123456789ABCDEF";
  let cols = 0;
  let drops = [];
  let rafId = null;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    cols = Math.floor(canvas.width / 16);
    drops = new Array(cols).fill(0).map(() => Math.random() * -50);
  }
  function draw() {
    ctx.fillStyle = "rgba(0, 0, 0, .08)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#00ff41";
    ctx.font = "14px 'JetBrains Mono', monospace";
    for (let i = 0; i < cols; i++) {
      const char = chars[Math.floor(Math.random() * chars.length)];
      ctx.fillText(char, i * 16, drops[i] * 16);
      if (drops[i] * 16 > canvas.height && Math.random() > .975) drops[i] = 0;
      drops[i]++;
    }
    rafId = requestAnimationFrame(draw);
  }
  window.addEventListener("resize", resize);
  resize();

  return {
    running: false,
    start() { if (!rafId) draw(); },
    stop() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
  };
})();

applyTheme(localStorage.getItem(THEME_KEY) || "neon");
