const http = require("http");
const { PrismaClient } = require("@prisma/client");

async function request(method, path, body, token) {
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
  const p = new PrismaClient();
  const backfill = await p.trip.updateMany({
    where: { customer: null, status: "Requested" },
    data: { customer: "Saba Steel" },
  });
  console.log("backfill", backfill);
  await p.$disconnect();

  const login = await request("POST", "/api/auth/login", {
    email: "mdanjuma@sabasteel.com",
    password: "Petroline@2026",
  });
  const parsed = JSON.parse(login.raw);
  console.log("user", {
    name: parsed.user?.name,
    role: parsed.user?.role,
    partnerCompanyName: parsed.user?.partnerCompanyName,
  });

  const list = await request("GET", "/api/trips", null, parsed.token);
  const trips = JSON.parse(list.raw);
  const partner = trips.filter(
    (t) => t.customer === "Saba Steel" || t.customer === "Customer Portal" || (!t.customer && t.status === "Requested"),
  );
  console.log(
    "partner-visible",
    partner.map((t) => ({
      id: t.id.slice(0, 8),
      customer: t.customer,
      consignee: t.customerConsignee,
      cargo: t.cargo,
      status: t.status,
    })),
  );
})();
