import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readSheet } from "read-excel-file/node";
import { strFromU8, unzipSync } from "fflate";
import {
  csvRowsToInventoryObjects,
  INVENTORY_IMPORT_TEMPLATE_COLUMNS,
  parseUnitTypeWorkbookRows,
  workbookRowsToInventoryObjects,
} from "../src/lib/developerImportTemplates.ts";

const unitTypesWorkbookPath = new URL("../public/templates/developer-project-import.xlsx", import.meta.url);
const inventoryWorkbookPath = new URL("../public/templates/developer-inventory-import.xlsx", import.meta.url);

test("developer workbook keeps instructions separate and import-safe", async () => {
  for (const workbookPath of [unitTypesWorkbookPath, inventoryWorkbookPath]) {
    const workbook = unzipSync(readFileSync(workbookPath));
    const workbookXml = strFromU8(workbook["xl/workbook.xml"]);
    const importXml = strFromU8(workbook["xl/worksheets/sheet2.xml"]);
    const sharedStrings = strFromU8(workbook["xl/sharedStrings.xml"]);

    assert.match(workbookXml, /name="Instructions"/);
    assert.match(workbookXml, /name="Import"/);
    assert.match(importXml, /<x:pane ySplit="1"/);
    assert.match(importXml, /<x:dataValidations/);
    assert.doesNotMatch(sharedStrings, /Example|Sample|Marina|placeholder/i);
  }

  const unitRows = await readSheet(unitTypesWorkbookPath, "Import");
  const inventoryRows = await readSheet(inventoryWorkbookPath, "Import");
  assert.equal(unitRows.length, 1, "the blank unit-type template must not contain import records");
  assert.equal(inventoryRows.length, 1, "the blank inventory template must not contain import records");
  assert.deepEqual(parseUnitTypeWorkbookRows(unitRows), []);
  assert.deepEqual(workbookRowsToInventoryObjects(inventoryRows), []);
});

test("both downloadable workbooks round-trip filled records through the exact import parsers", async () => {
  const unitHeaders = await readSheet(unitTypesWorkbookPath, "Import");
  const unitFilledRows = [
    unitHeaders[0],
    ["Apartment", "finished", "Courtyard homes", 2, 2, 120, 135, 2500000, 10, 8, 4, "Garden-facing", "Yes", "No", ...Array(14).fill("No")],
  ];
  const types = parseUnitTypeWorkbookRows(unitFilledRows);
  assert.equal(types[0].baseType, "Apartment");
  assert.equal(types[0].variants[0].price, 2500000);
  assert.deepEqual(types[0].variants[0].amenities, ["garden"]);

  const inventoryHeaders = await readSheet(inventoryWorkbookPath, "Import");
  assert.deepEqual(inventoryHeaders[0], [...INVENTORY_IMPORT_TEMPLATE_COLUMNS]);
  const inventoryFilledRows = [
    inventoryHeaders[0],
    ["Apt 1, courtyard", "apartment", "A real unit", "https://images.unsplash.com/photo-1.jpg|https://images.unsplash.com/photo-2.jpg|https://images.unsplash.com/photo-3.jpg", "A-001", "A", 1, "101", 2500000, 120, "available", "2026-11-21T00:00:00Z", 2, 2, 10, 25000, 8, "2027-12-01", "finished", "", "", "garden", "developer_sale", ""],
  ];
  const inventory = workbookRowsToInventoryObjects(inventoryFilledRows);
  assert.equal(inventory[0].property_name, "Apt 1, courtyard");
  assert.equal(inventory[0].property_type, "apartment");
  assert.equal(inventory[0].photos, "https://images.unsplash.com/photo-1.jpg|https://images.unsplash.com/photo-2.jpg|https://images.unsplash.com/photo-3.jpg");
  assert.equal(inventory[0].price, 2500000);
  assert.equal(inventory[0].unit_area, 120);
});

test("unit-type and inventory contracts round-trip through their shared parsers", () => {
  const typeHeaders = [
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
  ];
  const typeRows = [
    typeHeaders,
    ["Apartment", "finished", "Courtyard homes", 2, 2, 120, 135, 2500000, 10, 8, 4, "Garden-facing", "Yes", "No"],
    ["Apartment", "finished", "Courtyard homes", 2, 2, 120, 135, 2700000, 20, 8, 2, "Roof option", "No", "Yes"],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ];
  const types = parseUnitTypeWorkbookRows(typeRows);
  assert.equal(types.length, 1);
  assert.equal(types[0].variants.length, 2);
  assert.deepEqual(types[0].variants[0], {
    bedrooms: 2,
    bathrooms: 2,
    hasGarden: true,
    hasRoof: false,
    areaMin: 120,
    areaMax: 135,
    price: 2500000,
    downPayment: 10,
    installmentYears: 8,
    stockCount: 4,
    description: "Garden-facing",
    amenities: ["garden"],
  });

  const inventoryRows = csvRowsToInventoryObjects(
    "id,property_name,description,photos,price,availability\n" +
      'unit-1,"Apt 1, courtyard","A real unit","https://one.example|https://two.example",2500000,pending\n',
  );
  assert.deepEqual(inventoryRows, [{
    id: "unit-1",
    property_name: "Apt 1, courtyard",
    description: "A real unit",
    photos: "https://one.example|https://two.example",
    price: "2500000",
    availability_state: "pending",
  }]);
});

test("redirect feedback is persistent, announced, and moved into reading order", () => {
  const banner = readFileSync(new URL("../src/components/FeedbackBanner.tsx", import.meta.url), "utf8");
  const projectsPage = readFileSync(new URL("../src/app/developer/projects/page.tsx", import.meta.url), "utf8");

  assert.match(banner, /role=\{isError \? "alert" : "status"\}/);
  assert.match(banner, /aria-live=\{isError \? "assertive" : "polite"\}/);
  assert.match(banner, /aria-atomic="true"/);
  assert.match(banner, /useId\(\)/);
  assert.match(banner, /banner\.focus\(\{ preventScroll: true \}\)/);
  assert.match(banner, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(banner, /banner\.scrollIntoView\(\{ behavior: reducedMotion \? "auto" : "smooth", block: "start" \}\)/);
  assert.match(projectsPage, /<FeedbackBanner tone="error" message=\{pageError\} autoFocus \/>/);
  assert.match(projectsPage, /<FeedbackBanner tone="success" message=\{pageSuccess\} autoFocus \/>/);
});

test("project creation keeps a recoverable local draft and excludes uploads", () => {
  const wizard = readFileSync(new URL("../src/components/ProjectWizard.tsx", import.meta.url), "utf8");

  assert.match(wizard, /window\.localStorage\.setItem\(draftKey, JSON\.stringify\(draft\)\)/);
  assert.match(wizard, /window\.localStorage\.getItem\(key\)/);
  assert.match(wizard, /\["file", "submit", "button", "reset"\]\.includes\(control\.type\)/);
  assert.match(wizard, /control\.focus\(\{ preventScroll: true \}\)/);
  assert.match(wizard, /control\.scrollIntoView\(\{ block: "center", behavior: "smooth" \}\)/);
});
