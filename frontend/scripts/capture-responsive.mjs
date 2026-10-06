import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const targetUrl = process.argv[2] || 'http://127.0.0.1:5173/';
const outputDir = process.argv[3] || '../docs/ui-screenshots';
const widths = [320, 375, 768, 1024, 1440];
const height = 900;
const port = 9333;

const browser = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--disable-background-networking',
  '--disable-component-update',
  '--no-first-run',
  '--hide-scrollbars',
  `--remote-debugging-port=${port}`,
  '--remote-allow-origins=*',
  '--user-data-dir=/private/tmp/aa-responsive-capture',
  'about:blank',
], { stdio: 'ignore' });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getPageTarget() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = targets.find((target) => target.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // Chrome is still starting.
    }
    await delay(100);
  }
  throw new Error('Chrome DevTools endpoint did not become ready');
}

const page = await getPageTarget();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let requestId = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function command(method, params = {}) {
  requestId += 1;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
}

try {
  await mkdir(outputDir, { recursive: true });
  await command('Page.enable');

  for (const width of widths) {
    await command('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      screenWidth: width,
      screenHeight: height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await command('Page.navigate', { url: targetUrl });
    await delay(2500);

    const metrics = await command('Runtime.evaluate', {
      expression: '({ innerWidth, scrollWidth: document.documentElement.scrollWidth })',
      returnByValue: true,
    });
    const capture = await command('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await writeFile(`${outputDir}/home-${width}.png`, Buffer.from(capture.data, 'base64'));
    const { innerWidth, scrollWidth } = metrics.result.value;
    console.log(`${width}px: viewport=${innerWidth}px scrollWidth=${scrollWidth}px`);
  }
} finally {
  socket.close();
  browser.kill('SIGTERM');
}
