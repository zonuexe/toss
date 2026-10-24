import counter from "./counter.js";
import { createApp, h, ref } from "vue";

const app = createApp({
  setup() {
    const count = ref(0);
    const display = () => counter.formatCount(count.value);
    return () =>
      h("section", [
        h("p", { role: "status", "aria-live": "polite" }, [
          "Count: ",
          h("output", { "aria-label": "Count" }, display()),
        ]),
        h("button", {
          type: "button",
          onClick: () => count.value = counter.increment(count.value),
        }, "Increment"),
        " ",
        h("button", {
          type: "button",
          onClick: () => count.value = counter.reset(),
        }, "Reset"),
      ]);
  },
});

app.mount("#app");
document.querySelector("#startup")?.remove();
