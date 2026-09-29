import { initChrome } from "./common.js";

// Plain content pages (learn, legal): shared chrome only.
initChrome(document.body.dataset.page || "");
