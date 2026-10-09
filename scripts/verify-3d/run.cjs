// Serves dist/ with `vite preview`, runs a browser suite against it, and stops the server.
//   npm run build && npm run verify:hall      (or verify:globe)
//   node scripts/verify-3d/run.cjs hall|globe
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const suite = process.argv[2];
if (!["hall", "globe"].includes(suite)) { console.error("usage: run.cjs hall|globe"); process.exit(2); }
const PORT = process.env.VERIFY_PORT || "4199";
const url = `http://localhost:${PORT}/`;
const root = path.join(__dirname, "..", "..");

const waitUp = (tries = 60) =>
  new Promise((resolve, reject) => {
    const ping = () =>
      http.get(url, (res) => { res.resume(); resolve(); }).on("error", () => {
        if (--tries <= 0) reject(new Error(`preview server did not come up at ${url}`));
        else setTimeout(ping, 500);
      });
    ping();
  });

const server = spawn("npx", ["vite", "preview", "--port", PORT, "--strictPort"], { cwd: root, stdio: "ignore" });
const stop = () => server.kill();
process.on("exit", stop);

waitUp()
  .then(() => new Promise((resolve) => spawn("node", [path.join(__dirname, `${suite}.cjs`), url], { stdio: "inherit" }).on("exit", resolve)))
  .then((code) => { stop(); process.exit(code ?? 1); })
  .catch((e) => { console.error(e.message); stop(); process.exit(2); });
