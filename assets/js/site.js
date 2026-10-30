/* Space Weed design preview: the age gate, the menu sheet and the forms. Nothing is ever sent. */
(() => {
  /* ---------- Age gate: asks on every new visit, remembered for this tab only ---------- */
  const gate = document.querySelector("[data-gate]");
  if (gate) {
    let ok = false;
    try { ok = sessionStorage.getItem("sw-21") === "yes"; } catch (e) { ok = false; }
    if (!ok) {
      gate.hidden = false;
      document.body.classList.add("gate-open");
      document.documentElement.dataset.gate = "open";
      const yes = gate.querySelector("[data-gate-yes]");
      requestAnimationFrame(() => yes && yes.focus());
      gate.addEventListener("keydown", (e) => {
        if (e.key !== "Tab") return;
        const f = [...gate.querySelectorAll("a[href], button")].filter((el) => !el.hidden && el.offsetParent !== null);
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      });
      const film = gate.querySelector(".gate__film");
      const skip = gate.querySelector("[data-gate-skip]");
      yes.addEventListener("click", () => {
        try { sessionStorage.setItem("sw-21", "yes"); } catch (e) { /* private mode: the gate asks again next page */ }
        const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
        let done = false;
        // At the white-out the universe begins under the vapor, and the gate fades away over it.
        const finish = () => {
          if (done) return;
          done = true;
          delete document.documentElement.dataset.gate;
          document.dispatchEvent(new CustomEvent("sw:gate-passed"));
          gate.classList.add("is-out");
          setTimeout(() => {
            gate.hidden = true;
            gate.classList.remove("is-out", "is-playing");
            document.body.classList.remove("gate-open");
            if (film) film.pause();
            const main = document.getElementById("main");
            if (main) main.focus({ preventScroll: true });
          }, reducedMotion ? 220 : 780);
        };
        const play = () => {
          gate.classList.add("is-playing");
          const burstAt = parseFloat(film.dataset.burstAt) || 0;
          film.addEventListener("timeupdate", () => { if (burstAt && film.currentTime >= burstAt) finish(); });
          film.addEventListener("ended", finish, { once: true });
          film.play().catch(finish);
          if (skip) { skip.hidden = false; skip.addEventListener("click", finish, { once: true }); skip.focus(); }
        };
        // No film when motion is reduced, or when it hasn't loaded within a moment of the click.
        if (reducedMotion || !film || film.error) { finish(); return; }
        if (film.readyState >= 3) play();
        else {
          const giveUp = setTimeout(finish, 1500);
          film.addEventListener("canplay", () => { clearTimeout(giveUp); if (!done) play(); }, { once: true });
        }
      });
    }
  }

  /* ---------- Header: a solid band once the page has scrolled ---------- */
  const header = document.querySelector(".site-header");
  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- The menu sheet: the conventional nav, always one tap away ---------- */
  const toggle = document.querySelector(".menu-toggle");
  const sheet = document.getElementById("menu");
  if (toggle && sheet) {
    const set = (open) => {
      sheet.hidden = !open;
      document.body.classList.toggle("menu-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      if (open) { const first = sheet.querySelector("a"); if (first) first.focus(); }
    };
    toggle.addEventListener("click", () => set(sheet.hidden));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) { set(false); toggle.focus(); } });
  }

  /* ---------- Contact: a link can pick the reason in advance (?help=grower and so on) ---------- */
  const help = new URLSearchParams(location.search).get("help");
  if (help) { const r = document.querySelector(`input[name="help"][value="${CSS.escape(help)}"]`); if (r) r.checked = true; }

  /* ---------- Forms: check the fields, then say plainly that a preview sends nothing ---------- */
  document.querySelectorAll("form[data-mock]").forEach((form) => {
    const note = form.querySelector(".form-note");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = form.querySelector('input[type="email"]');
      const age = form.querySelector('input[name="age"]');
      let msg = "";
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) msg = "Enter an email address like name@example.com.";
      else if (age && !age.checked) msg = "Check the box to confirm you are 21 or older.";
      note.classList.toggle("is-error", !!msg);
      if (msg) { note.textContent = msg; (email && !email.value.trim() ? email : age || email).focus(); return; }
      note.textContent = "This is a design preview, so nothing was sent.";
    });
  });
})();
