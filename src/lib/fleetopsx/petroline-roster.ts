/**
 * Petroline Transport Ltd fleet roster — single source of truth for Cap (CAB),
 * Body (tails), and driver salary numbers. Generated from Fortune File + Driver Staff List.
 * Do not show raw API UUIDs in UI; enrich live records via these codes.
 */
export type PetrolineCab = {
  cabId: string;
  plate: string;
  category: string;
  destination: string;
};

export type PetrolineBody = {
  bodyId: string;
  plate: string;
  type: string;
  destination: string;
};

export type PetrolineDriver = {
  salaryNumber: string;
  name: string;
  phone: string;
  cabId: string;
};

export const PETROLINE_CABS: PetrolineCab[] = [
  {
    "cabId": "P001",
    "plate": "EPE 903 FS",
    "category": "Pickup",
    "destination": ""
  },
  {
    "cabId": "P002",
    "plate": "KSF 72 YF",
    "category": "Pickup",
    "destination": ""
  },
  {
    "cabId": "P004",
    "plate": "FKJ753XR",
    "category": "Short Body",
    "destination": "Customer"
  },
  {
    "cabId": "P005",
    "plate": "SBG566XR",
    "category": "Short Body",
    "destination": "Customer"
  },
  {
    "cabId": "P007",
    "plate": "AAA494XA",
    "category": "LOCAL",
    "destination": "Port"
  },
  {
    "cabId": "P009",
    "plate": "MUS10XB",
    "category": "LOCAL",
    "destination": "Port"
  },
  {
    "cabId": "P011",
    "plate": "KSF928XQ",
    "category": "LOCAL",
    "destination": "Port"
  },
  {
    "cabId": "P012",
    "plate": "KSF929XQ",
    "category": "LOCAL",
    "destination": "Port"
  },
  {
    "cabId": "P014",
    "plate": "GML376XX",
    "category": "LOCAL",
    "destination": "Port"
  },
  {
    "cabId": "P015",
    "plate": "SBG757ZY",
    "category": "LOCAL",
    "destination": "Port"
  },
  {
    "cabId": "P016",
    "plate": "GGW145XA",
    "category": "LOCAL",
    "destination": "Port"
  },
  {
    "cabId": "P017",
    "plate": "GRR171XA",
    "category": "LOCAL",
    "destination": "Customer"
  },
  {
    "cabId": "P018",
    "plate": "JHN402XA",
    "category": "LOCAL",
    "destination": "Port"
  },
  {
    "cabId": "P019",
    "plate": "JHN503XA",
    "category": "LOCAL",
    "destination": "Customer"
  },
  {
    "cabId": "P020",
    "plate": "JHN504XA",
    "category": "LOCAL",
    "destination": "Port"
  },
  {
    "cabId": "P021",
    "plate": "JHN506XA",
    "category": "LOCAL",
    "destination": "Customer"
  },
  {
    "cabId": "P022",
    "plate": "ZAR513XM",
    "category": "LOCAL",
    "destination": "Customer"
  },
  {
    "cabId": "P023",
    "plate": "MKR508ZP",
    "category": "LOCAL",
    "destination": "Customer"
  },
  {
    "cabId": "P024",
    "plate": "MKA434XV",
    "category": "LOCAL",
    "destination": "Customer"
  },
  {
    "cabId": "P025",
    "plate": "MGN899ZJ",
    "category": "LOCAL",
    "destination": "Port"
  },
  {
    "cabId": "P026",
    "plate": "BNG751ZF",
    "category": "LOCAL",
    "destination": "Customer"
  },
  {
    "cabId": "P027",
    "plate": "GML365XX",
    "category": "LOCAL",
    "destination": "Customer"
  },
  {
    "cabId": "P028",
    "plate": "GML368XX",
    "category": "LOCAL",
    "destination": "Customer"
  },
  {
    "cabId": "P029",
    "plate": "GRK177XA",
    "category": "LOCAL",
    "destination": "Port"
  },
  {
    "cabId": "P030",
    "plate": "DKA317XQ",
    "category": "LOCAL",
    "destination": "Customer"
  },
  {
    "cabId": "P031",
    "plate": "DKA321XQ",
    "category": "LOCAL",
    "destination": "Customer"
  },
  {
    "cabId": "P032",
    "plate": "ZAR883XX",
    "category": "LOCAL",
    "destination": "Port"
  },
  {
    "cabId": "P033",
    "plate": "SBG674XT",
    "category": "LOCAL",
    "destination": "Customer"
  },
  {
    "cabId": "P034",
    "plate": "MKA982XW",
    "category": "LOCAL",
    "destination": "Customer"
  },
  {
    "cabId": "P035",
    "plate": "BDA884XA",
    "category": "LOCAL",
    "destination": "Port"
  },
  {
    "cabId": "P036",
    "plate": "BDA887XA",
    "category": "LOCAL",
    "destination": "Port"
  },
  {
    "cabId": "P037",
    "plate": "RJA343XA",
    "category": "LOCAL",
    "destination": "Customer"
  },
  {
    "cabId": "P038",
    "plate": "RJA344XA",
    "category": "LOCAL",
    "destination": "Port"
  },
  {
    "cabId": "P039",
    "plate": "RJA345XA",
    "category": "LOCAL",
    "destination": "Customer"
  },
  {
    "cabId": "P040",
    "plate": "KNT781XP",
    "category": "LOCAL",
    "destination": "Port"
  },
  {
    "cabId": "P041",
    "plate": "KNT783XP",
    "category": "LOCAL",
    "destination": "Customer"
  },
  {
    "cabId": "P042",
    "plate": "KNT785XP",
    "category": "LOCAL",
    "destination": "Customer"
  },
  {
    "cabId": "P043",
    "plate": "KRD989YE",
    "category": "LOCAL",
    "destination": ""
  },
  {
    "cabId": "P044",
    "plate": "GGE109YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P045",
    "plate": "GGE100YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P046",
    "plate": "GGE107YE",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P047",
    "plate": "GGE83YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P048",
    "plate": "GGE86YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P049",
    "plate": "GGE104YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P051",
    "plate": "GGE102YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P052",
    "plate": "GGE106YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P053",
    "plate": "GGE97YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P054",
    "plate": "GGE84YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P055",
    "plate": "GGE85YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P056",
    "plate": "GGE96YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P057",
    "plate": "GGE87YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P058",
    "plate": "GGE94YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P059",
    "plate": "GGE91YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P060",
    "plate": "GGE103YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P061",
    "plate": "GGE101YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P062",
    "plate": "GGE98YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P063",
    "plate": "GGE89YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P064",
    "plate": "GGE105YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P065",
    "plate": "GGE95YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P066",
    "plate": "GGE92YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P067",
    "plate": "GGE99YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P068",
    "plate": "GGE90YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P069",
    "plate": "GGE88YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P070",
    "plate": "GGE93YK",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P071",
    "plate": "APP858YL",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P073",
    "plate": "APP857YL",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P074",
    "plate": "APP861YL",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P075",
    "plate": "APP864YL",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P076",
    "plate": "APP863YL",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P077",
    "plate": "APP862YL",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P078",
    "plate": "KRD280YL",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P079",
    "plate": "APP860YL",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P080",
    "plate": "FST568YL",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P081",
    "plate": "FST570YL",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P082",
    "plate": "FST569YL",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P083",
    "plate": "FST567YL",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P084",
    "plate": "KRD279YL",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P085",
    "plate": "APP589YL",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P086",
    "plate": "MNY180XB",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P087",
    "plate": "KRD994YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P088",
    "plate": "KRD986YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P089",
    "plate": "KRD992YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P090",
    "plate": "KRD993YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P091",
    "plate": "KRD995YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P092",
    "plate": "KRD987YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P093",
    "plate": "KRD996YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P094",
    "plate": "KRD988YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P095",
    "plate": "KRD997YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P096",
    "plate": "KRD985YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P097",
    "plate": "KRD989YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P098",
    "plate": "KRD991YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P099",
    "plate": "KRD998YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P100",
    "plate": "KRD990YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P101",
    "plate": "KRD999YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P102",
    "plate": "AKD323YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P103",
    "plate": "AKD322YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P104",
    "plate": "KRD532YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P105",
    "plate": "AKD321YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P106",
    "plate": "KRD534YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P107",
    "plate": "AKD326YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P108",
    "plate": "AKD324YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P109",
    "plate": "AKD320YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P110",
    "plate": "AKD328YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P111",
    "plate": "AKD327YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P112",
    "plate": "AKD325YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P113",
    "plate": "KRD531YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P114",
    "plate": "KRD530YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P115",
    "plate": "AKD329YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P116",
    "plate": "KRD533YM",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P117",
    "plate": "KTU958YN",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P118",
    "plate": "KTU956YN",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P119",
    "plate": "KTU959YN",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P120",
    "plate": "KTU957YN",
    "category": "UPCOUNTRY",
    "destination": ""
  },
  {
    "cabId": "P999",
    "plate": "AGL496YN",
    "category": "Pickup",
    "destination": ""
  },
  {
    "cabId": "Petroline",
    "plate": "Saba",
    "category": "Factory",
    "destination": ""
  }
];

export const PETROLINE_BODIES: PetrolineBody[] = [
  {
    "bodyId": "B001",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B002",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B003",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B004",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B005",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B006",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B007",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B008",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B009",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B010",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B011",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B012",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B013",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B014",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B015",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B016",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B017",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B018",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B019",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B020",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B021",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B022",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B023",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B024",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B025",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B026",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B027",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B028",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B029",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B030",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B031",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B032",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B033",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B034",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B035",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B036",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B037",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B038",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B039",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B040",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B041",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B042",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B043",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B044",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B045",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B046",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B047",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B048",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B049",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B050",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B051",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B052",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B053",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B054",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B055",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B056",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B057",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B058",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B059",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B060",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B061",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B062",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B063",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B064",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B065",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B066",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B067",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B068",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B069",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B070",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B071",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B072",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B073",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B074",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B075",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B076",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B077",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B078",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B079",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B080",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B081",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B082",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B083",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B084",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B085",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B086",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B087",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B088",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B089",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B090",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B091",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B092",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B093",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B094",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B095",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B096",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B097",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B098",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B099",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B100",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B1000",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B1001",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B1002",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B1003",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B1004",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B1005",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B1006",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  },
  {
    "bodyId": "B1007",
    "plate": "",
    "type": "Trailer",
    "destination": ""
  }
];

export const PETROLINE_DRIVERS: PetrolineDriver[] = [
  {
    "salaryNumber": "P00851",
    "name": "Musa Garuba",
    "phone": "09075501315",
    "cabId": "P004"
  },
  {
    "salaryNumber": "P00971",
    "name": "Muhammed Musa Aliu",
    "phone": "07030511347",
    "cabId": "P005"
  },
  {
    "salaryNumber": "P01019",
    "name": "Hassan Abdullahi",
    "phone": "08145511587",
    "cabId": "P007"
  },
  {
    "salaryNumber": "P01018",
    "name": "Muhammad Musa",
    "phone": "09038840110",
    "cabId": "P009"
  },
  {
    "salaryNumber": "P00935",
    "name": "Umar Abubakar",
    "phone": "07083922957",
    "cabId": "P011"
  },
  {
    "salaryNumber": "P01009",
    "name": "Mohammed Dauda",
    "phone": "08153465033",
    "cabId": "P012"
  },
  {
    "salaryNumber": "P00848",
    "name": "Adeyemi Sulaiman",
    "phone": "09050715348",
    "cabId": "P018"
  },
  {
    "salaryNumber": "P01010",
    "name": "Abubakar Abdullai",
    "phone": "07049990982",
    "cabId": "P015"
  },
  {
    "salaryNumber": "P00989",
    "name": "Yusuf Muhammed",
    "phone": "08120760563",
    "cabId": "P034"
  },
  {
    "salaryNumber": "P00934",
    "name": "Zakari Sanusi",
    "phone": "07040378057",
    "cabId": "P017"
  },
  {
    "salaryNumber": "P00997",
    "name": "Muktar Aliyu",
    "phone": "07069332210",
    "cabId": "P018"
  },
  {
    "salaryNumber": "P00909",
    "name": "Oseni Ahmed",
    "phone": "08052479219",
    "cabId": "P018"
  },
  {
    "salaryNumber": "P00879",
    "name": "Umoru Abdulmumuni",
    "phone": "08109223925",
    "cabId": "P021"
  },
  {
    "salaryNumber": "P01006",
    "name": "Yahaya Alhassan",
    "phone": "09126144854",
    "cabId": "P022"
  },
  {
    "salaryNumber": "P00944",
    "name": "Junbrin Tela Musa",
    "phone": "07062551299",
    "cabId": "P023"
  },
  {
    "salaryNumber": "P00991",
    "name": "Jarfar Shuaibu",
    "phone": "08051319087",
    "cabId": "P024"
  },
  {
    "salaryNumber": "P00891",
    "name": "Mohammed Ibrahim",
    "phone": "0912430289",
    "cabId": "P026"
  },
  {
    "salaryNumber": "P00963",
    "name": "Maniru Auwalu",
    "phone": "09034718790",
    "cabId": "P027"
  },
  {
    "salaryNumber": "P00910",
    "name": "Sani Mohammed",
    "phone": "09054677988",
    "cabId": "P028"
  },
  {
    "salaryNumber": "P00990",
    "name": "Musa Ibrahim",
    "phone": "09025182000",
    "cabId": "P029"
  },
  {
    "salaryNumber": "P00966",
    "name": "Hassan Mohammed",
    "phone": "08089364110",
    "cabId": "P018"
  },
  {
    "salaryNumber": "P00867",
    "name": "Ahmadu Ali",
    "phone": "07047558884",
    "cabId": ""
  },
  {
    "salaryNumber": "P00293",
    "name": "Mohammed",
    "phone": "08053160259",
    "cabId": ""
  },
  {
    "salaryNumber": "P01001",
    "name": "Adamu Muhammed",
    "phone": "07016779738",
    "cabId": ""
  },
  {
    "salaryNumber": "P01005",
    "name": "Abdullahi Adamu",
    "phone": "09055912576",
    "cabId": ""
  },
  {
    "salaryNumber": "P00983",
    "name": "Umar Adamu",
    "phone": "07016779738",
    "cabId": ""
  },
  {
    "salaryNumber": "P01001",
    "name": "Adamu Isah",
    "phone": "07060804674",
    "cabId": "P038"
  },
  {
    "salaryNumber": "P00979",
    "name": "Usman Adamu",
    "phone": "09024703369",
    "cabId": ""
  },
  {
    "salaryNumber": "P00967",
    "name": "Ali Mohammed",
    "phone": "08030573776",
    "cabId": ""
  },
  {
    "salaryNumber": "P00501",
    "name": "Mohammed Musa",
    "phone": "08143180442",
    "cabId": "P041"
  },
  {
    "salaryNumber": "P00981",
    "name": "Aderinde Muritala",
    "phone": "08127653596",
    "cabId": "P005"
  },
  {
    "salaryNumber": "P00974",
    "name": "Mudasiru Lawal",
    "phone": "08064538189",
    "cabId": "P104"
  },
  {
    "salaryNumber": "P00508",
    "name": "Umar Badamas",
    "phone": "08081732225",
    "cabId": "P040"
  },
  {
    "salaryNumber": "P00950",
    "name": "Hassan Isa",
    "phone": "09073416980",
    "cabId": ""
  },
  {
    "salaryNumber": "P00806",
    "name": "Mohammed Shaibu",
    "phone": "08167314570",
    "cabId": "P068"
  },
  {
    "salaryNumber": "P00985",
    "name": "Umbali Halilu",
    "phone": "09065243858",
    "cabId": ""
  },
  {
    "salaryNumber": "P00853",
    "name": "Lukman Ajasa",
    "phone": "08139495496",
    "cabId": ""
  },
  {
    "salaryNumber": "P01020",
    "name": "Zakari Mohammed",
    "phone": "08060347314",
    "cabId": ""
  },
  {
    "salaryNumber": "P00959",
    "name": "Hassan Abdullahi",
    "phone": "07042236908",
    "cabId": "P025"
  },
  {
    "salaryNumber": "P01016",
    "name": "Maude Umar",
    "phone": "07042236908",
    "cabId": ""
  },
  {
    "salaryNumber": "P00221",
    "name": "Ibrahim Garuba",
    "phone": "081666697246",
    "cabId": "P055"
  },
  {
    "salaryNumber": "P00883",
    "name": "Isiaka Haruna",
    "phone": "07017887954",
    "cabId": "P056"
  },
  {
    "salaryNumber": "P00747",
    "name": "Mohammed Rabiu G",
    "phone": "07036442300",
    "cabId": "P214"
  },
  {
    "salaryNumber": "P00859",
    "name": "Yahya Aliyu",
    "phone": "08052965606",
    "cabId": "P059"
  },
  {
    "salaryNumber": "P00952",
    "name": "Hamisu Isiya",
    "phone": "08035944433",
    "cabId": ""
  },
  {
    "salaryNumber": "P00733",
    "name": "Shamailu Dauda",
    "phone": "08078823106",
    "cabId": "P061"
  },
  {
    "salaryNumber": "P00868",
    "name": "Idowu Adekola",
    "phone": "08123151938",
    "cabId": "P036"
  },
  {
    "salaryNumber": "P00930",
    "name": "Monsuru Lamidi",
    "phone": "07048292784",
    "cabId": ""
  },
  {
    "salaryNumber": "P00970",
    "name": "Mohammed Auwalu",
    "phone": "0912951883",
    "cabId": "P064"
  },
  {
    "salaryNumber": "P00856",
    "name": "Abdullahi Abubakar P",
    "phone": "08158607133",
    "cabId": "P065"
  },
  {
    "salaryNumber": "P00992",
    "name": "Shafiu Haruna",
    "phone": "09055288341",
    "cabId": ""
  },
  {
    "salaryNumber": "P00911",
    "name": "Salisu Adamu",
    "phone": "08065879393",
    "cabId": "P067"
  },
  {
    "salaryNumber": "P00831",
    "name": "Bashiru Yahaya",
    "phone": "08120347796",
    "cabId": "P030"
  },
  {
    "salaryNumber": "P00958",
    "name": "Usman Haruna",
    "phone": "07010327422",
    "cabId": ""
  },
  {
    "salaryNumber": "P00984",
    "name": "Saidu Usaini",
    "phone": "07068268909",
    "cabId": ""
  },
  {
    "salaryNumber": "P00502",
    "name": "Dogo Danladi",
    "phone": "08135883555",
    "cabId": "P074"
  },
  {
    "salaryNumber": "P00906",
    "name": "Samsudeen Yarema",
    "phone": "07078667189 / 08150457838",
    "cabId": ""
  },
  {
    "salaryNumber": "P00560",
    "name": "Abdullahi Haruna",
    "phone": "08035334386",
    "cabId": ""
  },
  {
    "salaryNumber": "P00885",
    "name": "Buba Hammah",
    "phone": "08067685525",
    "cabId": "P015"
  },
  {
    "salaryNumber": "P00516",
    "name": "Sanusi Mohammed",
    "phone": "08152808911",
    "cabId": "P078"
  },
  {
    "salaryNumber": "P00956",
    "name": "Abdullahi Jidda",
    "phone": "07041243554",
    "cabId": "P079"
  },
  {
    "salaryNumber": "P00855",
    "name": "Mogaji Issa",
    "phone": "08035446246",
    "cabId": "P081"
  },
  {
    "salaryNumber": "P00704",
    "name": "Ganiyu Semiu",
    "phone": "08163467547",
    "cabId": "P082"
  },
  {
    "salaryNumber": "P00841",
    "name": "Salihu Mohammed",
    "phone": "08088574033",
    "cabId": "P083"
  },
  {
    "salaryNumber": "P00044",
    "name": "Ahmadu Illiyasu",
    "phone": "08136819489",
    "cabId": "P060"
  },
  {
    "salaryNumber": "P00226",
    "name": "Abdullahi Ibrahim",
    "phone": "07039997235",
    "cabId": "P017"
  },
  {
    "salaryNumber": "P00975",
    "name": "Samaila Musa",
    "phone": "07033333176",
    "cabId": "P109"
  },
  {
    "salaryNumber": "P00278",
    "name": "Muktar Ashimuyi",
    "phone": "08134557651",
    "cabId": "P045"
  },
  {
    "salaryNumber": "P00318",
    "name": "Sanni Garuba",
    "phone": "08039689245",
    "cabId": "P071"
  },
  {
    "salaryNumber": "P00251",
    "name": "Abdullahi Abubakar",
    "phone": "08035394966",
    "cabId": "P073"
  },
  {
    "salaryNumber": "P00259",
    "name": "Bashiru Abdullahi",
    "phone": "07065639344",
    "cabId": "P080"
  },
  {
    "salaryNumber": "P00102",
    "name": "Danladi Adamu",
    "phone": "08100310555",
    "cabId": "P076"
  },
  {
    "salaryNumber": "P00063",
    "name": "Yakubu Abubakar Biu",
    "phone": "08068030799",
    "cabId": "P084"
  },
  {
    "salaryNumber": "P00311",
    "name": "Muhammed Khalid",
    "phone": "09032514626",
    "cabId": "P048"
  },
  {
    "salaryNumber": "P00672",
    "name": "Lawan Tijani",
    "phone": "07071941219",
    "cabId": "P049"
  },
  {
    "salaryNumber": "P01015",
    "name": "Baballa Salisu",
    "phone": "08106764460",
    "cabId": ""
  },
  {
    "salaryNumber": "P00128",
    "name": "Bala Garuba",
    "phone": "07032047157",
    "cabId": "P070"
  },
  {
    "salaryNumber": "P00716",
    "name": "Ibrahim Abubakar",
    "phone": "07010709327",
    "cabId": "P057"
  },
  {
    "salaryNumber": "P00886",
    "name": "Illiasu Mohammed",
    "phone": "08034593978",
    "cabId": "P072"
  },
  {
    "salaryNumber": "P00069",
    "name": "Ado Sanni",
    "phone": "08132172750",
    "cabId": "P085"
  },
  {
    "salaryNumber": "P00017",
    "name": "Saidu Sule",
    "phone": "08119310521",
    "cabId": "P083"
  },
  {
    "salaryNumber": "P00866",
    "name": "Yusuf Mohammed",
    "phone": "07050862772",
    "cabId": ""
  },
  {
    "salaryNumber": "P00903",
    "name": "Abdullahi Adamu",
    "phone": "09064472332",
    "cabId": "P044"
  },
  {
    "salaryNumber": "P00933",
    "name": "Ibrahim Adamu",
    "phone": "08160057747",
    "cabId": ""
  },
  {
    "salaryNumber": "P00976",
    "name": "Hassan Umar Mamud",
    "phone": "08037055665",
    "cabId": "P064"
  },
  {
    "salaryNumber": "P00834",
    "name": "Ibrahim Hassan",
    "phone": "08155643758",
    "cabId": "P020"
  },
  {
    "salaryNumber": "P00913",
    "name": "Sanusi Abdullahi",
    "phone": "08034778605",
    "cabId": "P062"
  },
  {
    "salaryNumber": "P00771",
    "name": "Yahaya Alabi Moruf",
    "phone": "08155643758",
    "cabId": ""
  },
  {
    "salaryNumber": "P00923",
    "name": "Tijani Lawal Abba",
    "phone": "08080... (truncated in scan)",
    "cabId": ""
  },
  {
    "salaryNumber": "P00905",
    "name": "Hussein Yinusa",
    "phone": "09048999210",
    "cabId": "P037"
  },
  {
    "salaryNumber": "P00973",
    "name": "Samaila Ibrahim",
    "phone": "07066163662",
    "cabId": ""
  },
  {
    "salaryNumber": "P01017",
    "name": "Ali Umar",
    "phone": "08137429141",
    "cabId": ""
  },
  {
    "salaryNumber": "P00860",
    "name": "Ibrahim Aliyu",
    "phone": "07067252236",
    "cabId": "P048"
  },
  {
    "salaryNumber": "P01011",
    "name": "Abba Mohammed",
    "phone": "09069690379",
    "cabId": ""
  },
  {
    "salaryNumber": "P00904",
    "name": "Nasiru Aminu",
    "phone": "09030042258",
    "cabId": "P059"
  },
  {
    "salaryNumber": "P00982",
    "name": "Hassan Mohammed",
    "phone": "08167736574",
    "cabId": ""
  },
  {
    "salaryNumber": "P00546",
    "name": "Rabiu Mohammed",
    "phone": "091119972893",
    "cabId": ""
  },
  {
    "salaryNumber": "P00839",
    "name": "Yahaya",
    "phone": "07058644392",
    "cabId": ""
  },
  {
    "salaryNumber": "P00850",
    "name": "Auwalu Musa",
    "phone": "08035958315",
    "cabId": ""
  },
  {
    "salaryNumber": "P00936",
    "name": "Ali Mohammed",
    "phone": "07046511275",
    "cabId": ""
  },
  {
    "salaryNumber": "P00991",
    "name": "Jaffar Shaibu",
    "phone": "08051319087",
    "cabId": ""
  },
  {
    "salaryNumber": "P01009",
    "name": "Abdullahi Ibrahim",
    "phone": "",
    "cabId": ""
  },
  {
    "salaryNumber": "P00883",
    "name": "Haruna Isiaka",
    "phone": "07017887954",
    "cabId": ""
  }
];
