import fs from 'fs';

const API_URL = process.env.API_URL || "http://2.28.45.216/api";

// Helper for making requests
async function fetchApi(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  console.log(`\n-> ${options.method || 'GET'} ${url}`);
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  try {
    const res = await fetch(url, { ...options, headers });
    const text = await res.text();
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return data;
  } catch (error) {
    console.error(`[FAIL] ${options.method || 'GET'} ${endpoint}: ${error.message}`);
    throw error;
  }
}

async function runE2ETest() {
  console.log("=========================================");
  console.log("  FLEETOPSX - API E2E LIFECYCLE TEST");
  console.log("=========================================\n");

  let partnerToken = "";
  let adminToken = "";
  let orderId = "";

  try {
    console.log("--- STEP 1: AUTHENTICATION ---");
    // 1. Login as Sister Company (Partner)
    // Adjust credentials based on your actual test partner account
    const partnerLogin = await fetchApi('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: "mdanjuma@sabasteel.com", password: "Petroline@2026" })
    });
    partnerToken = partnerLogin.token;
    console.log("✅ Partner Login Successful");

    // 2. Login as Transport Manager / Fleet Operations (Admin)
    const adminLogin = await fetchApi('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: "manager@petroline.ng", password: "Petroline@2026" })
    });
    adminToken = adminLogin.token;
    console.log("✅ Admin Login Successful");


    console.log("\n--- STEP 2: PARTNER CREATES REQUEST ---");
    const orderPayload = {
      customerConsignee: "Test Saba Customer",
      cargo: "Steel Coils",
      tailType: "Flat",
      loadingSite: "Saba Factory",
      pickup: "Saba Factory",
      dropoff: "Abuja Depot",
      driverName: "Unassigned",
      truckReg: "Unassigned"
    };
    const orderRes = await fetchApi('/trips', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${partnerToken}` },
      body: JSON.stringify(orderPayload)
    });
    orderId = orderRes.id || orderRes._id;
    console.log(`✅ Order Created Successfully. Order ID: ${orderId}`);


    console.log("\n--- STEP 3: FLEET OPS ASSIGNS DISPATCH ---");
    // Here the Transport manager approves it or Fleet ops assigns it.
    // Assuming the endpoints match the services.ts configuration:
    
    // First, approve the order (if applicable)
    await fetchApi(`/trips/${orderId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ status: "Approved" })
    });
    console.log(`✅ Dispatch initially approved by Transport Manager`);

    const unauthorizedPatchRes = await fetchApi(`/trips/${orderId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${partnerToken}` },
      body: JSON.stringify({ status: "Approved" })
    }).catch(err => err);
    if (unauthorizedPatchRes instanceof Error && unauthorizedPatchRes.message.includes('403')) {
      console.log(`✅ [SECURITY] Partner prevented from patching trip (403 Forbidden)`);
    } else {
      throw new Error(`[SECURITY FAIL] Partner was able to patch trip!`);
    }

    // Assign truck, tail, driver, and costs (as Admin)
    const assignmentPayload = {
      truckReg: "TRK-001 / TAIL-99",
      tailType: "Flat",
      driverName: "John Doe",
      directCosts: {
        tripAllowance: 50000,
        returnWaybill: 5000,
        motorBoy: 10000,
        ticket: 2000,
        extraAllowance: 0,
        lubricantType: "Diesel",
        lubricantQuantity: 200,
        lubricantCost: 250000,
      },
      status: "Scheduled"
    };

    await fetchApi(`/trips/${orderId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify(assignmentPayload)
    });
    console.log(`✅ Fleet assigned (Truck Head, Tail, Driver, Costs)`);


    console.log("\n--- STEP 4: GATE SECURITY LOGS DEPARTURE (IN TRANSIT) ---");
    await fetchApi(`/trips/${orderId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ status: "En Route" })
    });
    console.log(`✅ Trip status updated to 'En Route' (Departed)`);


    console.log(`\n--- STEP 5: FLEET OPS LOGS TRACKING CHECKPOINT ---`);
    const trackRes = await fetchApi('/tracking', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({
        tripId: orderId,
        location: "Kasoa Toll Booth",
        leg: "Outgoing"
      })
    });
    console.log(`✅ Tracking location logged: ${trackRes.location} (ID: ${trackRes.id})`);

    const getTrackRes = await fetchApi(`/tracking/${orderId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (getTrackRes.length > 0 && getTrackRes[0].location === "Kasoa Toll Booth") {
      console.log(`✅ Customer successfully fetched live tracking location`);
    } else {
      throw new Error("Tracking checkpoint not found in history!");
    }

    console.log("\n--- STEP 6: GATE SECURITY LOGS RETURN (COMPLETED) ---");
    await fetchApi(`/trips/${orderId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ status: "Completed" })
    });
    console.log(`✅ Trip status updated to 'Completed' (Returned)`);


    console.log("\n=========================================");
    console.log("🎉 ALL E2E LIFECYCLE TESTS PASSED!");
    console.log("=========================================\n");

  } catch (err) {
    console.log("\n=========================================");
    console.log("❌ E2E LIFECYCLE TEST FAILED");
    console.log("=========================================\n");
    console.error("If you received 'fetch failed' or 'ERR_CONNECTION_REFUSED', the Hetzner API (2.28.45.216) is currently down or not listening on port 80/443.");
  }
}

runE2ETest();
