// Serves dist/ with `vite preview`, runs the hall suite against it, and stops the server.
//   npm run build && npm run verify:hall
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

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
  .then(() => new Promise((resolve) => spawn("node", [path.join(__dirname, "suite.cjs"), url], { stdio: "inherit" }).on("exit", resolve)))
  .then((code) => { stop(); process.exit(code ?? 1); })
  .catch((e) => { console.error(e.message); stop(); process.exit(2); });
