import { chromium } from "playwright";

const EVENT = process.argv[2] ?? "c3106908-70e2-453e-ab3d-de8e31359426";
const url = `http://localhost:5173/events/${EVENT}/graph`;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ??
    "C:/Users/Ангелина/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe",
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("console", (m) => console.log("[console]", m.type(), m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.screenshot({ path: "C:/Users/Ангелина/Downloads/SHURE/.shots/graph-initial.png", fullPage: false });

const info = await page.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll(".flow-task-node"));
  const rects = nodes.slice(0, 6).map((n) => {
    const r = n.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
  });
  const vp = document.querySelector(".react-flow__viewport")?.style.transform ?? "";
  const ticks = Array.from(document.querySelectorAll(".axis-tick__label")).map((t) => t.textContent);
  return { count: nodes.length, rects, vp, ticks };
});
console.log(JSON.stringify(info, null, 2));

// Зум внутрь: колесо мыши в центре графа
const box = await page.locator(".graph-flow-panel .react-flow__pane").boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 12; i += 1) {
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(1500);
await page.screenshot({ path: "C:/Users/Ангелина/Downloads/SHURE/.shots/graph-zoomed.png" });
console.log("ZOOM", await page.evaluate(() => document.querySelector(".react-flow__viewport")?.style.transform ?? ""));
console.log("TICKS", JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll(".axis-tick__label")).map((t) => t.textContent))));
await browser.close();
