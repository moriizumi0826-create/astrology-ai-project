// Isolated UI preview: no real API requests or account changes.
import { createServer, transformWithEsbuild } from "vite";
import config from "../../vite.v3.config.mjs";
const base = config({ mode: "development" });
let publishedMode = "current";
const server = await createServer({ ...base, configFile: false,
  server: { ...base.server, port: 5189, strictPort: true },
  plugins: [...base.plugins.filter(plugin => plugin.name !== "v3-build-version"), {
    name: "update-menu-preview",
    configureServer(server) {
      server.middlewares.use("/fixture-version", (req, res) => {
        publishedMode = new URL(req.url, "http://localhost").searchParams.get("mode");
        res.end("ok");
      });
      server.middlewares.use("/version.json", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        if (publishedMode === "error") { res.statusCode = 503; res.end("{}"); return; }
        res.end(JSON.stringify({ buildId: publishedMode === "new" ? "new-build" : JSON.parse(base.define.__APP_BUILD_ID__) }));
      });
      server.middlewares.use("/update-fixture", async (_req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.end(await server.transformIndexHtml("/update-fixture", '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>'));
      });
    },
    resolveId(id) { if (id === "/fixture.jsx") return "\0fixture.jsx"; },
    async load(id) {
      if (id !== "\0fixture.jsx") return;
      const code = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {UpdateMenu} from '/update-menu.jsx'; import {AccountControls} from '/account-controls.jsx'; import {AppVersionProvider,AppVersionContext} from '/app-version-context.jsx'; import '/tailwind.css';
      function App(){const [count,setCount]=React.useState(0);const version=React.useContext(AppVersionContext);return <><header className="flex items-center justify-between border-b bg-[#f8fafc] px-3 py-2 sm:px-8 sm:py-6"><a className="max-w-[66px] font-serif text-[11px] font-bold leading-[0.98] text-[#0A192F] sm:max-w-none sm:text-4xl">The Celestial Atelier</a><div className="flex shrink-0 items-center gap-2 sm:gap-3"><AccountControls session={{user_id:'fixture'}}/><UpdateMenu versionState={{isOutdated:count===0}} onRefreshLatest={()=>setCount(v=>v+1)}/></div></header><main className="p-5"><label>公開状態<select aria-label="公開状態" defaultValue="current" onChange={async e=>{await fetch('/fixture-version?mode='+e.target.value);await version.check(true);}}><option value="current">最新</option><option value="new">新バージョンを公開</option><option value="error">通信エラー</option></select></label><p>再計算回数：{count}</p><p>読込URL：{location.href}</p></main></>;}createRoot(document.getElementById('root')).render(<AppVersionProvider><App/></AppVersionProvider>);`;
      return (await transformWithEsbuild(code, "fixture.jsx", { loader: "jsx" })).code;
    }
  }]
});
await server.listen();
console.log("http://127.0.0.1:5189/update-fixture");
