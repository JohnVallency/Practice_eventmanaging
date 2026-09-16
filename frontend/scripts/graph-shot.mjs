/**
 * Дебаг-скрипт: снимает граф зависимостей в нескольких масштабах через Playwright.
 * Запуск: node scripts/graph-shot.mjs <eventId> [outDir]
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";

const eventId = process.argv[2] ?? "dc97a297-58ed-436d-b56e-f3eba78229ee";
const outDir = process.argv[3] ?? "shots";
mkdirSync(outDir, { recursive: true });

/** Установленный в системе Chromium (браузеры ставились Python-версией Playwright). */
const localChrome = `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe`;
const browser = await chromium.launch(existsSync(localChrome) ? { executablePath: localChrome } : {});
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on("console", (msg) => console.log(`[console.${msg.type()}]`, msg.text()));
page.on("pageerror", (err) => console.log("[pageerror]", err.message));

await page.goto(`http://localhost:5173/events/${eventId}/graph`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/graph-1-initial.png` });

/** Дамп позиций узлов/рёбер и вьюпорта для анализа геометрии. */
const dump = await page.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll(".react-flow__node")).map((el) => {
    const r = el.getBoundingClientRect();
    return { cls: el.className, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });
  const edges = Array.from(document.querySelectorAll(".react-flow__edge")).map((el) => {
    const r = el.getBoundingClientRect();
    return { id: el.getAttribute("data-id"), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });
  const pane = document.querySelector(".react-flow__viewport")?.getAttribute("style") ?? "";
  return { nodes, edges, pane };
});
console.log("VIEWPORT:", dump.pane);
console.log("NODES:", JSON.stringify(dump.nodes.filter((n) => n.cls.includes("task")), null, 0).slice(0, 2000));
console.log("AXIS NODES:", JSON.stringify(dump.nodes.filter((n) => n.cls.includes("axis")).slice(0, 12)));
console.log("EDGES:", JSON.stringify(dump.edges.slice(0, 8)));

// Приближаем масштаб колёсиком к центру панели — смотрим часовые метки
const box = await page.locator(".graph-flow-panel").boundingBox();
if (box) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 12; i += 1) {
    await page.mouse.wheel(0, -220);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/graph-2-zoomed.png` });
  const axisLabels = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".axis-tick__label")).map((el) => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent, x: Math.round(r.x), w: Math.round(r.width) };
    }),
  );
  console.log("ZOOMED AXIS LABELS:", JSON.stringify(axisLabels));
}

await browser.close();
