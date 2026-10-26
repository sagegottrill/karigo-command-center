/* RESTORE the truck registry states clobbered by stale-repair.cjs (the K()
 * helper stripped slashes before splitting, so every matched token collapsed
 * and the script judged all 73 rows unbacked). The true-backup JSON below is
 * the exact BACKUP section it printed BEFORE any update. */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const backup = [
  {"id":"7a4ca404-d7de-4085-9b0f-fb9ac1316acb","registration":"AAA494XA","status":"Out of Yard","cabId":"P007"},
  {"id":"4e1b2194-9af6-4ec7-ac42-0c8c2b3410cf","registration":"AAA394YP","status":"Out of Yard","cabId":"P122"},
  {"id":"b10351a9-e78f-42a6-8713-b03f131840b1","registration":"GGE102YK","status":"Out of Yard","cabId":"P051"},
  {"id":"c5759027-8e89-4afa-8bdf-adab8ebd2ee8","registration":"DKA321XQ","status":"Out of Yard","cabId":"P031"},
  {"id":"d2087d98-5806-4386-931c-2b23f8903b55","registration":"AAA391YP","status":"Out of Yard","cabId":"P121"},
  {"id":"d5267d49-2a33-4539-b0e6-964986a95162","registration":"GGE96YK","status":"Assigned","cabId":"P056"},
  {"id":"aea10e8e-6221-4a55-84df-764b6bd2a685","registration":"BNG751ZF","status":"Assigned","cabId":"P026"},
  {"id":"5b22a87e-4e85-49ff-a0fb-fc084d504279","registration":"AAA392YP","status":"Out of Yard","cabId":"P123"},
  {"id":"aec037ca-7a8b-44e7-965e-b42396e6e3f3","registration":"AAA395YP","status":"Out of Yard","cabId":"P125"},
  {"id":"5d5d1acc-98f7-431f-89f1-b88292098376","registration":"MKA434XV","status":"Assigned","cabId":"P024"},
  {"id":"5ecb4dbf-3b94-4433-8284-826ec1e7217d","registration":"GGE109YK","status":"Out of Yard","cabId":"P044"},
  {"id":"1d87584a-7b49-4f8a-aa7e-551e0fd6db3b","registration":"SBG757ZY","status":"Out of Yard","cabId":"P015"},
  {"id":"a72569e2-c464-44d3-b5a2-4dc715464f61","registration":"KSF928XQ","status":"Out of Yard","cabId":"P011"},
  {"id":"7f863d2c-3dbc-4ee9-99f9-d921cc01036d","registration":"JHN506XA","status":"Out of Yard","cabId":"P021"},
  {"id":"409ae490-e5bb-4905-924c-7c43324c52ba","registration":"MUS10XB","status":"Out of Yard","cabId":"P009"},
  {"id":"f234851b-f5f9-4886-a44f-d892d2180e4f","registration":"KRD279YL","status":"Out of Yard","cabId":"P084"},
  {"id":"7dfe58c8-1ee1-4fbc-8bf9-c57e988111c4","registration":"MNY180XB","status":"Out of Yard","cabId":"P086"},
  {"id":"31688b53-41fb-44fd-838b-72c078fa28c5","registration":"FST567YL","status":"Out of Yard","cabId":"P083"},
  {"id":"5694498c-773c-4ec4-b9e3-5e99b6e795c8","registration":"GRR171XA","status":"Assigned","cabId":"P017"},
  {"id":"7d85b78b-bbb2-4dd1-8b85-0c17fce1632d","registration":"KRD999YM","status":"Out of Yard","cabId":"P101"},
  {"id":"1947bb39-5736-496e-a91b-1c37ef0d4a19","registration":"AKD323YM","status":"Out of Yard","cabId":"P102"},
  {"id":"9c8ca34d-43c3-45a7-af66-a83dad088766","registration":"KRD987YM","status":"Out of Yard","cabId":"P092"},
  {"id":"5839b241-b852-4c74-8a61-ddc691b5b68e","registration":"GML365XX","status":"Out of Yard","cabId":"P027"},
  {"id":"969f5f3b-c58a-405a-9259-bdbb48194bc0","registration":"AKD324YM","status":"Out of Yard","cabId":"P108"},
  {"id":"bc7c3a5b-7d36-4ece-8c28-282ece983f98","registration":"GML376XX","status":"Out of Yard","cabId":"P014"},
  {"id":"48b91e36-9475-4dba-8b20-a7b9d4fd144a","registration":"GGE91YK","status":"Out of Yard","cabId":"P059"},
  {"id":"bbefdaab-f081-4e2a-bddf-bcefd5306aa8","registration":"FST570YL","status":"Out of Yard","cabId":"P081"},
  {"id":"c4f20885-4e97-4d94-b861-33dad31c48b5","registration":"APP857YL","status":"Out of Yard","cabId":"P073"},
  {"id":"1fbd7d39-6707-4436-9405-c2c52026f0e5","registration":"KNT785XP","status":"Assigned","cabId":"P042"},
  {"id":"44cde5f0-d18f-4adf-af8c-145bd8759989","registration":"AKD322YM","status":"Out of Yard","cabId":"P103"},
  {"id":"35321540-d80e-4c67-8fd4-b8e884410f1a","registration":"GGE86YK","status":"Out of Yard","cabId":"P048"},
  {"id":"99af64f1-9f3c-4159-a3b5-81711720e24a","registration":"KRD531YM","status":"Out of Yard","cabId":"P113"},
  {"id":"d9c6e872-1e37-4c82-94e1-e6b6fde9b01e","registration":"AKD328YM","status":"Out of Yard","cabId":"P110"},
  {"id":"c91230da-de44-4f82-bd88-af8522adc213","registration":"MKA982XW","status":"Out of Yard","cabId":"P034"},
  {"id":"8f83e6cc-2e66-406f-a012-a59574c71f7c","registration":"GGE101YK","status":"Out of Yard","cabId":"P061"},
  {"id":"f9f51b82-17fa-4e95-ac9d-2b79ce4a0e84","registration":"KRD997YM","status":"Out of Yard","cabId":"P095"},
  {"id":"a34697b6-af28-4c4a-af24-1c1f22dcb8d3","registration":"KRD993YM","status":"Out of Yard","cabId":"P090"},
  {"id":"4943e10e-3de1-4108-adf8-8fbae3e5463d","registration":"GGE100YK","status":"Out of Yard","cabId":"P045"},
  {"id":"2de7d669-4e33-423a-bbe4-2eef4d9cea56","registration":"GGE85YK","status":"Out of Yard","cabId":"P055"},
  {"id":"5f28ca2a-acbb-4cee-b90d-c03cfd4deded","registration":"GGE92YK","status":"Out of Yard","cabId":"P066"},
  {"id":"be37199e-3bca-4c61-b807-65f2cdf2270a","registration":"GGE103YK","status":"Out of Yard","cabId":"P060"},
  {"id":"8a0e365c-aaaa-486d-9099-081a5b236cb8","registration":"GGE88YK","status":"Out of Yard","cabId":"P069"},
  {"id":"7fc6723e-279c-4b97-a740-dcec9f41548d","registration":"GGE83YK","status":"Out of Yard","cabId":"P047"},
  {"id":"616a47e2-f760-41cc-ae0f-ff3565828f61","registration":"KRD986YM","status":"Out of Yard","cabId":"P088"},
  {"id":"8916c690-9f87-4eb9-9d98-42e695c7a946","registration":"DKA317XQ","status":"Out of Yard","cabId":"P030"},
  {"id":"9923885a-f955-42a0-ba6d-03253ac28259","registration":"APP860YL","status":"Assigned","cabId":"P079"},
  {"id":"a0ed556e-f5ff-4fbb-8162-bc7ee0c37af6","registration":"KRD985YM","status":"Out of Yard","cabId":"P096"},
  {"id":"ba486144-4cba-473e-a364-29769f7b4db7","registration":"KRD534YM","status":"Out of Yard","cabId":"P106"},
  {"id":"48705bae-88ae-45da-8256-1a018d1b6849","registration":"KNT781XP","status":"Assigned","cabId":"P040"},
  {"id":"a31ee7d2-a4d7-41f7-89df-d6c4bf27b81d","registration":"KRD989YM","status":"Assigned","cabId":"P097"},
  {"id":"62f260f8-18f4-4e95-841e-79a2d4cc7396","registration":"GGE94YK","status":"Assigned","cabId":"P058"},
  {"id":"0425163f-02b5-4fb1-8b93-a84c3feebef2","registration":"KRD994YM","status":"Out of Yard","cabId":"P087"},
  {"id":"421b8e19-3578-42a2-87cf-ef5eb837446f","registration":"APP863YL","status":"Out of Yard","cabId":"P076"},
  {"id":"764bd7a0-502e-42c5-91bf-290be6b30ebf","registration":"APP858YL","status":"Out of Yard","cabId":"P071"},
  {"id":"f1e62623-cf6c-4aea-96c4-e06b9321ff8c","registration":"GGE97YK","status":"Out of Yard","cabId":"P053"},
  {"id":"6d09b0ef-54dc-4179-8bd0-c8056eeceeeb","registration":"AKD320YM","status":"Out of Yard","cabId":"P109"},
  {"id":"39f6ae5f-c0b0-44f4-852a-44e666a59e89","registration":"AKD326YM","status":"Out of Yard","cabId":"P107"},
  {"id":"75b72df1-125f-483b-9e02-4476b02fbbb8","registration":"KRD532YM","status":"Out of Yard","cabId":"P104"},
  {"id":"b390d421-15ed-4d52-aa34-258ec82421c8","registration":"GGE87YK","status":"Out of Yard","cabId":"P057"},
  {"id":"9ba5db02-1b05-49eb-affe-977bcfe4eedb","registration":"BDA887XA","status":"Assigned","cabId":"P036"},
  {"id":"584d35b5-4fcc-4065-85a0-38bb4e0c760b","registration":"APP864YL","status":"Out of Yard","cabId":"P075"},
  {"id":"dbed6838-061d-4173-a714-d35f28dad08b","registration":"FST569YL","status":"Out of Yard","cabId":"P082"},
  {"id":"13d6814d-41e4-4e1d-8808-6eadbb5494e0","registration":"GGE84YK","status":"Out of Yard","cabId":"P054"},
  {"id":"11ea999f-8810-4fab-ac0e-b683bfc88c89","registration":"RJA345XA","status":"Assigned","cabId":"P039"},
  {"id":"0106f1ea-95a8-41b7-a211-2b5b9e7150e4","registration":"AKD321YM","status":"Out of Yard","cabId":"P105"},
  {"id":"55a6e38b-c375-429e-af6a-a331be6c3998","registration":"KRD988YM","status":"Out of Yard","cabId":"P094"},
  {"id":"ad4e352d-12aa-4ea5-a1bd-acc064b24563","registration":"APP861YL","status":"Out of Yard","cabId":"P074"},
  {"id":"67c2987b-d87d-466c-a781-b20177ace29a","registration":"KRD998YM","status":"Assigned","cabId":"P099"},
  {"id":"1ed4cd27-cff7-4db5-a0c2-cd8959231cf0","registration":"KTU958YN","status":"Out of Yard","cabId":"P117"},
  {"id":"35b103cf-8dcd-4b07-8b33-f7a206402827","registration":"AKD325YM","status":"Out of Yard","cabId":"P112"},
  {"id":"6a33a1bf-e7a8-4bec-9af7-24214aa19268","registration":"KRD992YM","status":"Out of Yard","cabId":"P089"},
  {"id":"77249782-90ff-46c8-b274-7558bf779e23","registration":"KRD530YM","status":"Out of Yard","cabId":"P114"},
  {"id":"6dcf0f1b-f4ca-47fd-9b16-6be5bd4a7d20","registration":"AKD329YM","status":"Out of Yard","cabId":"P115"}
];
(async () => {
  let n = 0, mismatch = 0;
  for (const b of backup) {
    const cur = await p.truck.findUnique({ where: { id: b.id }, select: { registration: true, status: true } });
    if (!cur) { console.log("MISSING", b.registration); mismatch++; continue; }
    if (cur.status !== "Available" && cur.status !== b.status) console.log("NOTE", b.registration, "now:", cur.status, "restore→", b.status);
    await p.truck.update({ where: { id: b.id }, data: { status: b.status } });
    n++;
  }
  console.log("RESTORED:", n, "| anomalies:", mismatch);
  await p.$disconnect();
})().catch((e) => { console.error("RESTORE FAILED:", e.message); process.exit(1); });
