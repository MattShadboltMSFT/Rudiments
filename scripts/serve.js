import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../site/", import.meta.url));
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/exercises.js", ["exercises.js", "text/javascript; charset=utf-8"]],
  ["/notation.js", ["notation.js", "text/javascript; charset=utf-8"]],
  ["/wake-lock.js", ["wake-lock.js", "text/javascript; charset=utf-8"]],
  ["/session.js", ["session.js", "text/javascript; charset=utf-8"]],
  ["/scoring.js", ["scoring.js", "text/javascript; charset=utf-8"]],
]);
const port = Number(process.env.PORT ?? 4173);

createServer(async (request, response) => {
  const file = files.get(new URL(request.url, "http://localhost").pathname);
  if (!file) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  try {
    const content = await readFile(join(root, file[0]));
    response.writeHead(200, { "content-type": file[1] });
    response.end(content);
  } catch (error) {
    console.error(error);
    response.writeHead(500);
    response.end("Could not serve page");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Rudiments is running at http://127.0.0.1:${port}`);
});
