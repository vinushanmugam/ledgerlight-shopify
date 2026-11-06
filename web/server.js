// Runs the public tester page on any computer that has Node: `node web/server.js`.
import http from "node:http";
import { Readable } from "node:stream";
import { handle } from "./handler.js";

const MAX_BODY = 9 * 1024 * 1024; // two files of up to 4 MB, plus a little overhead
const port = Number(process.env.PORT) || 3000;

http
  .createServer(async (req, res) => {
    try {
      const hasBody = req.method !== "GET" && req.method !== "HEAD";
      let size = 0;
      const limited = Readable.from(
        (async function* () {
          for await (const chunk of req) {
            size += chunk.length;
            if (size > MAX_BODY) throw new Error("body too large");
            yield chunk;
          }
        })(),
      );
      const request = new Request(`http://${req.headers.host || "localhost"}${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: hasBody ? Readable.toWeb(limited) : undefined,
        duplex: "half",
      });
      const response = await handle(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error("request failed:", error.message);
      res.writeHead(413, { "content-type": "text/plain" });
      res.end("That request was too large or could not be read.");
    }
  })
  .listen(port, () => console.log(`LedgerLight checker listening on port ${port}`));
