const http = require("http");

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    if (data) headers["Content-Length"] = Buffer.byteLength(data);
    const req = http.request(
      { hostname: "127.0.0.1", port: 80, path, method, headers },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve({ status: res.statusCode, raw }));
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const login = await request("POST", "/api/auth/login", {
    email: "mdanjuma@sabasteel.com",
    password: "Petroline@2026",
  });
  const parsed = JSON.parse(login.raw);
  console.log("login", login.status, !!parsed.token);
  const list = await request("GET", "/api/trips", null, parsed.token);
  const trips = JSON.parse(list.raw);
  const id = trips[0]?.id;
  console.log("list", list.status, "first", id);
  if (!id) return;
  const one = await request("GET", "/api/trips/" + id, null, parsed.token);
  console.log("get", one.status, one.raw.slice(0, 200));
})();
