import { defineConfig } from "deepsec/config";

export default defineConfig({
  projects: [
    { id: "billsincongress", root: ".." },
    // <deepsec:projects-insert-above>
  ],
});
