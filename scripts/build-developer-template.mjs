// Optional authoring helper. The committed XLSX files are standalone assets;
// production installs, tests, and builds do not need the private authoring
// runtime. To regenerate them locally, pass the absolute module path supplied
// by the spreadsheet runtime, for example:
// BRIXELER_ARTIFACT_TOOL_PATH=/path/to/artifact_tool.mjs node scripts/build-developer-template.mjs
const artifactToolPath = process.env.BRIXELER_ARTIFACT_TOOL_PATH;
if (!artifactToolPath) {
  throw new Error("Workbook generation is optional. Set BRIXELER_ARTIFACT_TOOL_PATH to an artifact_tool.mjs module path before running this script.");
}
const { SpreadsheetFile, Workbook } = await import(artifactToolPath);

const outputPath = new URL("../public/templates/developer-project-import.xlsx", import.meta.url).pathname;
const workbook = Workbook.create();
const instructions = workbook.worksheets.add("Instructions");
const importSheet = workbook.worksheets.add("Import");

const dark = "#101010";
const lime = "#DFF579";
const muted = "#5D6250";
const border = "#D9DED1";

instructions.showGridLines = false;
instructions.tabColor = lime;
instructions.getRange("A1:F1").merge();
instructions.getRange("A1").values = [["Brixeler project inventory template"]];
instructions.getRange("A1:F1").format = {
  fill: dark,
  font: { bold: true, color: "#FFFFFF", size: 16 },
  verticalAlignment: "center",
};
instructions.getRange("A1:F1").format.rowHeight = 30;
instructions.getRange("A3:F3").merge();
instructions.getRange("A3").values = [["Use this workbook to add unit types and variants to one selected project phase."]];
instructions.getRange("A3:F3").format = { font: { color: muted, italic: true }, wrapText: true };

const instructionRows = [
  ["Step", "What to do", "Required", "Where"],
  ["1", "Choose a project, release phase, and template type in the dashboard before uploading.", "Yes", "Dashboard"],
  ["2", "Open the Import sheet. Keep the header row unchanged and add one row per unit-type variant.", "Yes", "Import"],
  ["3", "Leave optional cells blank when a value is not known. Do not add example or placeholder units.", "Yes", "Import"],
  ["4", "Save this workbook as .xlsx, upload it, review the preview, then save the imported records.", "Yes", "Dashboard"],
];
instructions.getRange("A5:D9").values = instructionRows;
instructions.getRange("A5:D5").format = { fill: dark, font: { bold: true, color: "#FFFFFF" }, wrapText: true };
instructions.getRange("A6:D9").format = { borders: { bottom: { style: "thin", color: border } }, wrapText: true, verticalAlignment: "center" };
instructions.getRange("A6:A9").format = { font: { bold: true, color: dark }, horizontalAlignment: "center" };
instructions.getRange("A5:D9").format.rowHeight = 28;

instructions.getRange("A11:F11").merge();
instructions.getRange("A11").values = [["Import sheet fields"]];
instructions.getRange("A11:F11").format = { fill: lime, font: { bold: true, color: dark } };
instructions.getRange("A12:B24").values = [
  ["Field", "How it is used"],
  ["Base Type", "Required. Groups variants into one property type."],
  ["Finishing Status", "Optional list value: finished, semi_finished, core_and_shell, or furnished."],
  ["Type Description", "Optional description for the property type."],
  ["Bedrooms / Bathrooms", "Optional whole numbers, zero or greater."],
  ["Area Min / Area Max (m²)", "Optional numeric range. Maximum should be at least minimum."],
  ["Price (EGP)", "Required numeric variant price."],
  ["Down Payment (%)", "Optional percentage from 0 to 100."],
  ["Installment Years", "Optional whole number greater than zero."],
  ["Stock Count", "Optional whole number, zero or greater."],
  ["Variant Description", "Optional description for the variant."],
  ["Amenity columns", "Choose Yes or No. Selected amenities are attached to the variant."],
  ["Blank rows", "Ignored. No rows are created from blank or instructional rows."],
];
instructions.getRange("A12:B12").format = { fill: dark, font: { bold: true, color: "#FFFFFF" } };
instructions.getRange("A13:B24").format = { borders: { bottom: { style: "thin", color: border } }, wrapText: true, verticalAlignment: "center" };
instructions.getRange("A12:B24").format.rowHeight = 24;
instructions.getRange("A1:F24").format.font = { name: "Aptos", size: 10 };
instructions.getRange("A1:F1").format.font = { name: "Aptos Display", bold: true, color: "#FFFFFF", size: 16 };
instructions.getRange("A:A").format.columnWidth = 24;
instructions.getRange("B:B").format.columnWidth = 72;
instructions.getRange("C:C").format.columnWidth = 14;
instructions.getRange("D:D").format.columnWidth = 18;
instructions.freezePanes.freezeRows(5);

const headers = [
  "Base Type",
  "Finishing Status",
  "Type Description",
  "Bedrooms",
  "Bathrooms",
  "Area Min (m²)",
  "Area Max (m²)",
  "Price (EGP)",
  "Down Payment (%)",
  "Installment Years",
  "Stock Count",
  "Variant Description",
  "Garden?",
  "Has Roof?",
  "Bicycle Lanes?",
  "Disability Support?",
  "Jogging Trail?",
  "Outdoor Pools?",
  "Mosque?",
  "Sports Clubs?",
  "Business Hub?",
  "Commercial Strip?",
  "Medical Center?",
  "Schools?",
  "Underground Parking?",
  "Clubhouse?",
  "Terrace?",
  "Sea View?",
];
importSheet.showGridLines = false;
importSheet.tabColor = dark;
importSheet.getRange("A1:AB1").values = [headers];
importSheet.getRange("A1:AB1").format = {
  fill: dark,
  font: { bold: true, color: "#FFFFFF" },
  wrapText: true,
  verticalAlignment: "center",
  borders: {
    top: { style: "thin", color: dark },
    bottom: { style: "thin", color: dark },
    left: { style: "thin", color: dark },
    right: { style: "thin", color: dark },
  },
};
importSheet.getRange("A1:AB1").format.rowHeight = 42;
importSheet.getRange("A2:AB200").format = { borders: { bottom: { style: "hair", color: border } }, verticalAlignment: "center" };
importSheet.getRange("A2:AB200").format.rowHeight = 20;
importSheet.getRange("A2:A200").dataValidation = {
  rule: { type: "list", values: ["Studio", "Apartment", "Duplex", "Quadhouse", "Townhouse", "Twinhouse", "Standalone"] },
  ignoreBlanks: true,
  inCellDropDown: true,
};
importSheet.getRange("B2:B200").dataValidation = {
  rule: { type: "list", values: ["finished", "semi_finished", "core_and_shell", "furnished"] },
  ignoreBlanks: true,
  inCellDropDown: true,
};
for (const range of ["D2:E200", "J2:K200"]) {
  importSheet.getRange(range).dataValidation = { rule: { type: "whole", operator: "greaterThanOrEqual", formula1: 0 }, ignoreBlanks: true };
}
for (const range of ["F2:I200"]) {
  importSheet.getRange(range).dataValidation = { rule: { type: "decimal", operator: "greaterThanOrEqual", formula1: 0 }, ignoreBlanks: true };
}
importSheet.getRange("I2:I200").dataValidation = { rule: { type: "decimal", operator: "between", formula1: 0, formula2: 100 }, ignoreBlanks: true };
importSheet.getRange("M2:AB200").dataValidation = { rule: { type: "list", values: ["Yes", "No"] }, ignoreBlanks: true, inCellDropDown: true };
importSheet.getRange("D2:E200").format.numberFormat = "0";
importSheet.getRange("F2:F200").format.numberFormat = "0.00";
importSheet.getRange("G2:G200").format.numberFormat = "0.00";
importSheet.getRange("H2:H200").format.numberFormat = "#,##0";
importSheet.getRange("I2:I200").format.numberFormat = "0.00";
importSheet.getRange("J2:K200").format.numberFormat = "0";
importSheet.getRange("A2:AB200").format.font = { name: "Aptos", size: 10 };
const widths = [22, 19, 34, 11, 11, 15, 15, 16, 19, 18, 14, 34, ...Array(16).fill(18)];
widths.forEach((width, index) => importSheet.getRangeByIndexes(0, index, 200, 1).format.columnWidth = width);
importSheet.freezePanes.freezeRows(1);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`Saved ${outputPath}`);

const inventoryOutputPath = new URL("../public/templates/developer-inventory-import.xlsx", import.meta.url).pathname;
const inventoryWorkbook = Workbook.create();
const inventoryInstructions = inventoryWorkbook.worksheets.add("Instructions");
const inventorySheet = inventoryWorkbook.worksheets.add("Import");

inventoryInstructions.showGridLines = false;
inventoryInstructions.tabColor = lime;
inventoryInstructions.getRange("A1:F1").merge();
inventoryInstructions.getRange("A1").values = [["Brixeler individual-units template"]];
inventoryInstructions.getRange("A1:F1").format = {
  fill: dark,
  font: { bold: true, color: "#FFFFFF", size: 16 },
  verticalAlignment: "center",
};
inventoryInstructions.getRange("A1:F1").format.rowHeight = 30;
inventoryInstructions.getRange("A3:F3").merge();
inventoryInstructions.getRange("A3").values = [["Use this workbook to add real, row-level units to one selected project phase."]];
inventoryInstructions.getRange("A3:F3").format = { font: { color: muted, italic: true }, wrapText: true };

inventoryInstructions.getRange("A5:D10").values = [
  ["Step", "What to do", "Required", "Where"],
  ["1", "Choose a project, release phase, and Individual units in the dashboard before uploading.", "Yes", "Dashboard"],
  ["2", "Open the Import sheet. Keep the header row unchanged and add one row per real unit.", "Yes", "Import"],
  ["3", "Required fields are property_name, property_type, description, photos, price, and unit_area. Photos are three or more unique HTTPS URLs from Brixeler uploads or approved media hosts, separated by |.", "Yes", "Import"],
  ["4", "Leave optional cells blank when a value is not known. Do not add example or placeholder units.", "Yes", "Import"],
  ["5", "Save this workbook as .xlsx, upload it, review the preview, then save the imported records.", "Yes", "Dashboard"],
];
inventoryInstructions.getRange("A5:D5").format = { fill: dark, font: { bold: true, color: "#FFFFFF" }, wrapText: true };
inventoryInstructions.getRange("A6:D10").format = { borders: { bottom: { style: "thin", color: border } }, wrapText: true, verticalAlignment: "center" };
inventoryInstructions.getRange("A6:A10").format = { font: { bold: true, color: dark }, horizontalAlignment: "center" };
inventoryInstructions.getRange("A5:D10").format.rowHeight = 32;
inventoryInstructions.getRange("A12:F12").merge();
inventoryInstructions.getRange("A12").values = [["Import sheet fields"]];
inventoryInstructions.getRange("A12:F12").format = { fill: lime, font: { bold: true, color: dark } };
inventoryInstructions.getRange("A13:B25").values = [
  ["Field", "How it is used"],
  ["property_name", "Required display name for the unit."],
  ["property_type", "Required value such as apartment, villa, twinhouse, townhouse, duplex, penthouse, chalet, or studio."],
  ["description", "Required unit description."],
  ["photos", "Required: at least three unique HTTPS URLs from Brixeler uploads or approved media hosts, separated by |. Arbitrary HTTPS hosts are rejected."],
  ["price / unit_area", "Required numeric values; price is at least EGP 100,000 and area is at least 10 m²."],
  ["inventory_code / building / unit_number", "Optional identifiers used by the sales team."],
  ["availability_state", "Optional: available, held, reserved, contracted, sold, or released. Controlled states still follow server workflow rules."],
  ["bedrooms / bathrooms / floor_number", "Optional whole numbers within the server-supported ranges."],
  ["down_payment_percentage / monthly_installment", "Optional non-negative payment values; down payment is 0–100."],
  ["delivery_date / price_effective_from", "Optional ISO date/timestamp values."],
  ["finishing_status / sale_type", "Optional validated values; use the dropdowns on the Import sheet."],
  ["Blank rows", "Ignored. No rows are created from blank or instructional rows."],
];
inventoryInstructions.getRange("A13:B13").format = { fill: dark, font: { bold: true, color: "#FFFFFF" } };
inventoryInstructions.getRange("A14:B25").format = { borders: { bottom: { style: "thin", color: border } }, wrapText: true, verticalAlignment: "center" };
inventoryInstructions.getRange("A13:B25").format.rowHeight = 25;
inventoryInstructions.getRange("A1:F25").format.font = { name: "Aptos", size: 10 };
inventoryInstructions.getRange("A1:F1").format.font = { name: "Aptos Display", bold: true, color: "#FFFFFF", size: 16 };
inventoryInstructions.getRange("A:A").format.columnWidth = 32;
inventoryInstructions.getRange("B:B").format.columnWidth = 78;
inventoryInstructions.getRange("C:C").format.columnWidth = 14;
inventoryInstructions.getRange("D:D").format.columnWidth = 18;
inventoryInstructions.freezePanes.freezeRows(5);

const inventoryHeaders = [
  "property_name",
  "property_type",
  "description",
  "photos",
  "inventory_code",
  "building",
  "floor_number",
  "unit_number",
  "price",
  "unit_area",
  "availability_state",
  "price_effective_from",
  "bedrooms",
  "bathrooms",
  "down_payment_percentage",
  "monthly_installment",
  "installment_years",
  "delivery_date",
  "finishing_status",
  "floor_plan_url",
  "video_tour_url",
  "amenities",
  "sale_type",
  "inventory_notes",
];
inventorySheet.showGridLines = false;
inventorySheet.tabColor = dark;
inventorySheet.getRange("A1:X1").values = [inventoryHeaders];
inventorySheet.getRange("A1:X1").format = {
  fill: dark,
  font: { bold: true, color: "#FFFFFF" },
  wrapText: true,
  verticalAlignment: "center",
  borders: {
    top: { style: "thin", color: dark },
    bottom: { style: "thin", color: dark },
    left: { style: "thin", color: dark },
    right: { style: "thin", color: dark },
  },
};
inventorySheet.getRange("A1:X1").format.rowHeight = 42;
inventorySheet.getRange("A2:X200").format = { borders: { bottom: { style: "hair", color: border } }, verticalAlignment: "center" };
inventorySheet.getRange("A2:X200").format.rowHeight = 20;
inventorySheet.getRange("B2:B200").dataValidation = {
  rule: { type: "list", values: ["apartment", "villa", "twinhouse", "townhouse", "duplex", "penthouse", "chalet", "studio", "cabin", "office", "clinic", "retail", "serviced_studio", "branded_apartment", "branded_villa", "luxury_apartment", "ultra_luxury_apartment", "ultra_luxury_villa", "one_story_villa", "pharmacy", "serviced_apartment", "loft"] },
  ignoreBlanks: true,
  inCellDropDown: true,
};
inventorySheet.getRange("K2:K200").dataValidation = {
  rule: { type: "list", values: ["available", "held", "reserved", "contracted", "sold", "released"] },
  ignoreBlanks: true,
  inCellDropDown: true,
};
inventorySheet.getRange("S2:S200").dataValidation = {
  rule: { type: "list", values: ["not_finished", "semi_finished", "finished", "furnished", "flexi_finished"] },
  ignoreBlanks: true,
  inCellDropDown: true,
};
inventorySheet.getRange("W2:W200").dataValidation = {
  rule: { type: "list", values: ["developer_sale", "resale"] },
  ignoreBlanks: true,
  inCellDropDown: true,
};
for (const range of ["G2:G200", "M2:N200", "Q2:Q200"]) {
  inventorySheet.getRange(range).dataValidation = { rule: { type: "whole", operator: "greaterThanOrEqual", formula1: 0 }, ignoreBlanks: true };
}
for (const range of ["I2:J200", "O2:P200"]) {
  inventorySheet.getRange(range).dataValidation = { rule: { type: "decimal", operator: "greaterThanOrEqual", formula1: 0 }, ignoreBlanks: true };
}
inventorySheet.getRange("O2:O200").dataValidation = { rule: { type: "decimal", operator: "between", formula1: 0, formula2: 100 }, ignoreBlanks: true };
inventorySheet.getRange("G2:G200").format.numberFormat = "0";
inventorySheet.getRange("I2:I200").format.numberFormat = "#,##0";
inventorySheet.getRange("J2:J200").format.numberFormat = "0.00";
inventorySheet.getRange("M2:N200").format.numberFormat = "0";
inventorySheet.getRange("O2:P200").format.numberFormat = "0.00";
inventorySheet.getRange("Q2:Q200").format.numberFormat = "0";
inventorySheet.getRange("A2:X200").format.font = { name: "Aptos", size: 10 };
const inventoryWidths = [24, 22, 38, 58, 18, 18, 12, 16, 16, 14, 18, 24, 11, 11, 24, 22, 18, 18, 18, 32, 32, 24, 18, 30];
inventoryWidths.forEach((width, index) => inventorySheet.getRangeByIndexes(0, index, 200, 1).format.columnWidth = width);
inventorySheet.freezePanes.freezeRows(1);

const inventoryOutput = await SpreadsheetFile.exportXlsx(inventoryWorkbook);
await inventoryOutput.save(inventoryOutputPath);
console.log(`Saved ${inventoryOutputPath}`);
