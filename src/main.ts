import { backend, on } from "./bridge";
import { render } from "./ui/app";
import { store } from "./ui/store";

async function start() {
  const root = document.getElementById("app")!;
  store.subscribe((s) => render(root, s));

  // Subscribe before fetching the snapshot so no event is lost in between.
  await Promise.all([
    on("rift:connection", (connection) => store.patchSnapshot({ connection })),
    on("rift:phase", (phase) => store.patchSnapshot({ phase })),
    on("rift:champ-select", (champSelect) => store.patchSnapshot({ champSelect })),
    on("rift:live", (live) => store.patchSnapshot({ live })),
    on("rift:overlay", (overlay) => store.patchSnapshot({ overlay })),
    on("rift:mock", (mock) => store.update({ mock })),
    on("rift:ddragon", (data) => store.setDdragon(data)),
  ]);

  const [snapshot, ddragon] = await Promise.all([backend.snapshot(), backend.ddragon()]);
  store.setDdragon(ddragon);
  store.update({ snapshot, mock: snapshot.mock ? await backend.mock.status() : null });
}

start().catch((e) => {
  document.getElementById("app")!.textContent = `Rift Advisor failed to start: ${e}`;
  console.error(e);
});
