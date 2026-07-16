// Elle dogrulama: derlenmis out/agentos.js'i canli 8100'e karsi calistirir.
// Kullanim: node verify.js   (once npm run compile)
const a = require("./out/agentos.js");
const cfg = { url: process.env.VYRON_URL || "http://127.0.0.1:8100" };

(async () => {
  console.log("1) Saglayicilar...");
  const provs = await a.fetchProviders(cfg);
  console.log("   ", provs.length, "saglayici; ilk:", provs[0].id, "-", provs[0].label);

  console.log("2) Arama (q=vyron)...");
  const s = await a.search(cfg, "vyron");
  console.log("   ", s.results.length, "sonuc; ilk:", s.results[0] && s.results[0].title);

  console.log("3) Sohbet (cerebras, kucuk)...");
  const r = await a.sendChat(cfg, "cerebras", [
    { role: "user", content: "tek kelime: merhaba de" },
  ]);
  console.log("   yanit:", JSON.stringify(r.reply), "| model:", r.model, "| sn:", r.elapsed);

  console.log("HEPSI GECTI");
})().catch((e) => {
  console.error("BASARISIZ:", e.message);
  process.exit(1);
});
