import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { getCourierQuotes, validatePackage } from "../services/shiprocketService";

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "POST" && req.url === "/v1/external/auth/login") {
    res.end(JSON.stringify({ token: "contract-test-token" }));
    return;
  }
  if (req.method === "GET" && req.url?.startsWith("/v1/external/courier/serviceability/")) {
    assert.equal(req.headers.authorization, "Bearer contract-test-token");
    const url = new URL(req.url, "http://localhost");
    assert.equal(url.searchParams.get("pickup_postcode"), "302001");
    assert.equal(url.searchParams.get("delivery_postcode"), "110001");
    assert.equal(url.searchParams.get("cod"), "1");
    assert.equal(url.searchParams.get("weight"), "1.25");
    res.end(JSON.stringify({
      data: {
        available_courier_companies: [
          { courier_company_id: 22, courier_name: "Courier B", rate: 95, estimated_delivery_days: 2 },
          { courier_company_id: 11, courier_name: "Courier A", rate: 72.5, estimated_delivery_days: 3 },
        ],
      },
    }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ message: `Unexpected ${req.method} ${req.url}` }));
});

async function run() {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  process.env.SHIPROCKET_API_URL = `http://127.0.0.1:${address.port}/v1/external`;
  process.env.SHIPROCKET_EMAIL = "contract@example.com";
  process.env.SHIPROCKET_PASSWORD = "contract-password";

  const packageDetails = validatePackage({ weight: 1.25, length: 20, breadth: 15, height: 10 });
  const quotes = await getCourierQuotes({
    pickupPincode: "302001",
    deliveryPincode: "110001",
    paymentMethod: "COD",
    declaredValue: 1499,
    packageDetails,
  });

  assert.equal(quotes.length, 2);
  assert.equal(quotes[0].courierId, 11);
  assert.equal(quotes[0].rate, 72.5);
  assert.equal(quotes[0].cheapest, true);
  assert.equal(quotes[1].cheapest, false);
  console.log("Shiprocket API contract test passed");
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => server.close());
