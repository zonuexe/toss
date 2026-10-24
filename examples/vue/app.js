import "/counter.js";
import { createApp, h, ref } from "vue";
import { formatCount, increment, reset } from "./bridge.js";

const app = createApp({
  setup() {
    const count = ref(0);
    const display = () => formatCount(count.value);
    return () =>
      h("section", [
        h("p", { role: "status", "aria-live": "polite" }, [
          "Count: ",
          h("output", { "aria-label": "Count" }, display()),
        ]),
        h("button", {
          type: "button",
          onClick: () => count.value = increment(count.value),
        }, "Increment"),
        " ",
        h("button", {
          type: "button",
          onClick: () => count.value = reset(),
        }, "Reset"),
      ]);
  },
});

app.mount("#app");
document.querySelector("#startup")?.remove();
