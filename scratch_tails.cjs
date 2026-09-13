const fs = require('fs');
const mockDataPath = 'src/lib/fleetopsx/mock-data.ts';
let mockData = fs.readFileSync(mockDataPath, 'utf8');

const tails = Array.from({length: 100}, (_, i) => {
  const n = String(i + 1).padStart(3, '0');
  return `{ id: "TAIL-${n}", number: "B${n}", registration: "TAIL-REG-${n}", type: "Flatbed Tail", status: "Available", location: "Lagos HQ", lat: 6.5244, lng: 3.3792 }`;
});

const replacement = `export const TRUCK_TAILS: TruckTail[] = [\n  ${tails.join(',\n  ')}\n];`;
mockData = mockData.replace(/export const TRUCK_TAILS: TruckTail\[\] = \[\];/, replacement);
fs.writeFileSync(mockDataPath, mockData);
