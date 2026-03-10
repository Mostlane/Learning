import { api } from "./api.js";

const sessionBadge = document.querySelector("[data-session-status]");

if (sessionBadge) {
  api.getCurrentSession()
    .then((session) => {
      sessionBadge.textContent = `Signed in as ${session?.user?.fullName || "Unknown"}`;
      sessionBadge.classList.add("sla-ok");
    })
    .catch(() => {
      sessionBadge.textContent = "Not signed in";
      sessionBadge.classList.add("sla-warn");
    });
}
