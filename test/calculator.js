/* ============================================================
   slushycalc.com — calculator.js
   Slushy Calculator — Complete Formula Reference (Validated Build)
   ============================================================
 
   CONSTANTS (never exposed to user)
   targetBrix       = 13.5
   targetABV        = 9       (% — empirically validated on Ninja SLUSHi, max cold)
   ABV_hardStop     = 25      (%)
   brixCorrection   = 0.184   (ABV expressed as whole number)
   brix_2to1_syrup  = 67
   brix_1to1_syrup  = 50
   ============================================================ */
 
'use strict';
 
const TARGET_BRIX     = 13.5;
const TARGET_ABV      = 9;
const ABV_HARD_STOP   = 25;
const BRIX_CORRECTION = 0.184;
const BRIX_2TO1       = 67;
const BRIX_1TO1       = 50;
 
// Page title as loaded; restored after printing (see init).
const ORIGINAL_TITLE  = document.title;
 
// ---- Unit conversions to ounces ----
 
function toOz(value, unit) {
  switch (unit) {
    case 'oz':    return value;
    case 'ml':    return value / 29.5735;
    case 'qt':    return value * 32;
    case 'gal':   return value * 128;
    case 'l':     return value * 33.814;
    case 'tsp':   return value * 0.166667;
    case 'dashes': return value * 0.020833;
    case 'drops': return value * 0.0016907;
    default:      return value;
  }
}
 
function ozToMl(oz) {
  return oz * 29.5735;
}
 
// ---- Ingredient row management ----
 
let ingredientCount = 0;
 
function createIngredientRow() {
  ingredientCount++;
  const li = document.createElement('li');
  const id  = ingredientCount;
 
  li.innerHTML = `
    <div class="ingredient-card" role="group" aria-label="Ingredient ${id}">
      <div class="ingredient-row-top">
        <input type="text" class="form-control ingredient-name" placeholder="Ingredient name" aria-label="Ingredient name" autocomplete="off">
        <button type="button" class="btn btn-danger btn-sm btn-remove" aria-label="Remove this ingredient">&times;</button>
      </div>
      <div class="ingredient-row-bottom">
        <div class="input-group ingredient-qty-unit">
          <input type="number" class="form-control ingredient-quantity" placeholder="Qty" min="0" step="0.25" aria-label="Quantity">
          <select class="form-select ingredient-unit" aria-label="Unit">
            <option value="oz">Ounces</option>
            <option value="ml">Milliliters</option>
            <option value="tsp">Teaspoons</option>
            <option value="dashes">Dashes</option>
            <option value="drops">Drops</option>
          </select>
        </div>
        <div class="input-group ingredient-abv-group">
          <input type="number" class="form-control ingredient-abv" placeholder="ABV" min="0" max="100" step="0.5" aria-label="ABV percent">
          <span class="input-group-text">%</span>
        </div>
      </div>
    </div>
  `;
 
  // Remove button handler
  li.querySelector('.btn-remove').addEventListener('click', () => {
    li.remove();
  });
 
  return li;
}
 
// ---- Validation ----
 
function showError(msg) {
  const el = document.getElementById('error-alert');
  el.textContent = msg;
  el.style.display = 'block';
  document.getElementById('results').style.display = 'none';
}
 
function clearError() {
  const el = document.getElementById('error-alert');
  el.style.display = 'none';
}
 
// ---- Core formula ----
 
function runCalculation() {
  clearError();
 
  // --- Collect ingredients ---
  const rows = document.querySelectorAll('#ingredient-list li');
  const ingredients = [];
  let rowIndex = 0;
 
  for (const row of rows) {
    const name = row.querySelector('.ingredient-name').value.trim();
    const qty  = parseFloat(row.querySelector('.ingredient-quantity').value);
    const unit = row.querySelector('.ingredient-unit').value;
    const abv  = parseFloat(row.querySelector('.ingredient-abv').value);
 
    if (!name && isNaN(qty)) continue; // skip completely empty rows
    rowIndex++;
 
    const label = name ? `"${name}"` : `Ingredient ${rowIndex}`;
 
    if (!name) {
      showError(`Ingredient ${rowIndex} is missing a name.`);
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      showError(`${label} has a missing or invalid quantity. Please enter a number greater than zero.`);
      return;
    }
    if (isNaN(abv) || abv < 0 || abv > 100) {
      showError(`${label} is missing an ABV value. Please enter a number between 0 and 100.`);
      return;
    }
 
    ingredients.push({ name, oz: toOz(qty, unit), abv });
  }
 
  if (ingredients.length === 0) {
    showError('Please add at least one ingredient.');
    return;
  }
 
  // --- V: total volume in oz ---
  const V = ingredients.reduce((sum, i) => sum + i.oz, 0);
 
  // --- A: blended ABV ---
  const A = ingredients.reduce((sum, i) => sum + i.abv * i.oz, 0) / V;
 
  // --- HARD STOP ---
  if (A > ABV_HARD_STOP) {
    showError(`Blended ABV is ${A.toFixed(1)}%, which exceeds the 25% limit. The recipe is too concentrated to proceed. Reduce the proportion of high-proof spirits.`);
    return;
  }
 
  // --- B: raw refractometer reading ---
  const B = parseFloat(document.getElementById('brix-input').value);
  if (isNaN(B) || B < 0 || B > 100) {
    showError('Step 3: Please enter a valid refractometer reading (0–100).');
    return;
  }
 
  // --- S: syrup Brix ---
  const S = parseFloat(document.querySelector('input[name="syrup-type"]:checked').value);
 
  // --- Machine volume ---
  const machineVolumeRaw  = parseFloat(document.getElementById('machine-volume').value);
  const machineVolumeUnit = document.getElementById('machine-unit').value;
  if (isNaN(machineVolumeRaw) || machineVolumeRaw <= 0) {
    showError('Step 5: Please enter a valid machine volume greater than zero.');
    return;
  }
  const M = toOz(machineVolumeRaw, machineVolumeUnit);
 
  // --- Step 2: Correct Brix for alcohol ---
  // Sugar can't be negative. A reading at or just below the alcohol's own
  // contribution (a nearly sugarless drink, within measurement noise) would
  // otherwise give Bc < 0, which sneaks past the routing test below and skips
  // the water dilution, leaving the drink far above the target ABV.
  const Bc = A === 0 ? B : Math.max(0, B - (BRIX_CORRECTION * A));
 
  // --- Step 3: Choose path ---
  let Fv, Sv, Wv, pathLabel, warnings = [];
  let syrupOnlyBelowTarget = false; // true when Path 2 had to fall back to syrup-only
 
  // Early exit: drink already meets both targets — just scale, no additions
  if (Math.abs(Bc - TARGET_BRIX) < 0.1 && A <= TARGET_ABV) {
    pathLabel = 'No additions needed';
    Fv = V;
    Sv = 0;
    Wv = 0;
 
  } else {
    // ratio = 0 when A = 0, correctly routes non-alcoholic drinks to Path 1.
    // ratio = Infinity when Bc = 0 (no sugar at all), which routes to Path 2.
    const ratio = A === 0 ? 0 : (A * TARGET_BRIX) / Bc;
 
    if (ratio <= TARGET_ABV) {
      // PATH 1 — Brix-First
      pathLabel = 'Path 1 (water dilution)';
      Fv = V * Bc / TARGET_BRIX;
      Sv = 0;
      Wv = Fv - V;
 
      if (Wv < 0) {
        // Brix below target — fall back to Path 3
        pathLabel = 'Path 3 (syrup addition only)';
        Sv = V * (TARGET_BRIX - Bc) / (S - TARGET_BRIX);
        Fv = V + Sv;
        Wv = 0;
      }
 
    } else {
      // PATH 2 — ABV-First
      // Only reached when ratio > TARGET_ABV, i.e. Bc < 1.5 x A. In that case
      // TARGET_BRIX x Fv = 1.5 x A x V > Bc x V, so Sv below is always positive.
      pathLabel = 'Path 2 (ABV-first with syrup correction)';
      Fv = (A * V) / TARGET_ABV;
      Sv = (TARGET_BRIX * Fv - Bc * V) / S;
      Wv = Fv - V - Sv;
 
      if (Wv < 0) {
        // Water floor: reaching target ABV would need negative water, so the
        // drink is already at or under target ABV and low on sugar. Water can't
        // help; correct Brix with syrup only (same fallback as Path 1).
        // Wv < 0 here always implies Bc < TARGET_BRIX, so Sv stays positive.
        pathLabel = 'Path 3 (syrup addition only)';
        Sv = V * (TARGET_BRIX - Bc) / (S - TARGET_BRIX);
        Fv = V + Sv;
        Wv = 0;
        syrupOnlyBelowTarget = true;
      }
    }
  }
 
  // --- Step 4: Scale to machine volume ---
  // Fv is always rebuilt from the parts so it is the volume the drink ACTUALLY
  // has, never the theoretical "diluted to 9% ABV" volume. In Path 2 that
  // theoretical volume can be SMALLER than the drink itself (a drink already
  // under 9% ABV), which once scaled an Aperol Spritz batch to 757 oz for a
  // 640 oz machine. On every other path V + Sv + Wv already equals Fv.
  Fv = V + Sv + Wv;
 
  if (!isFinite(Fv) || Fv <= 0) {
    showError('Something went wrong calculating this recipe. Please check your ingredient quantities and Brix reading.');
    return;
  }
 
  if (syrupOnlyBelowTarget) {
    const finalAbv = (A * V) / Fv;
    if (finalAbv < TARGET_ABV - 0.05) {
      warnings.push(`This recipe is already below the ${TARGET_ABV}% ABV target (about ${finalAbv.toFixed(1)}% as a finished batch), so no water is added — only syrup, to reach the target sweetness.`);
    }
  }
 
  const scale = M / Fv;
 
  const scaledIngredients = ingredients.map(i => ({
    name: i.name,
    oz:   i.oz * scale,
    ml:   ozToMl(i.oz * scale),
    isAddition: false,
  }));
 
  const scaledSyrup = Sv * scale;
  const scaledWater = Wv * scale;
 
  // ---- Batch size label ----
 
  // Up to two decimals, no trailing zeros (5 -> "5", 2.5 -> "2.5", 2.25 -> "2.25")
  const machineVolumeDisplay = String(Number(machineVolumeRaw.toFixed(2)) || machineVolumeRaw);
  const machineUnitLabel = { oz: 'oz', qt: 'Quart', gal: 'Gallon', l: 'Liter' }[machineVolumeUnit];
  const batchLabel = `${machineVolumeDisplay}-${machineUnitLabel} Batch`;
 
  // ---- Serving count (optional) ----
 
  const servingSizeRaw  = parseFloat(document.getElementById('serving-size').value);
  const servingSizeUnit = document.getElementById('serving-unit').value;
  const servingCountEl  = document.getElementById('results-serving-count');
 
  if (!isNaN(servingSizeRaw) && servingSizeRaw > 0) {
    const servingSizeOz  = toOz(servingSizeRaw, servingSizeUnit);
    // The batch is M oz by construction. Dividing M (not Fv x scale) with a tiny
    // epsilon keeps exact fits exact: floating-point error otherwise turns
    // 640 / 8 into 79 servings in a few percent of cases.
    const servingCount   = Math.floor(M / servingSizeOz + 1e-9);
    const servingSizeMl  = ozToMl(servingSizeOz).toFixed(0);
    const servingLabel   = servingSizeUnit === 'oz'
      ? `${batchLabel} — Approx. ${servingCount} ${servingSizeRaw}-oz (${servingSizeMl} mL) Serving${servingCount !== 1 ? 's' : ''}`
      : `${batchLabel} — Approx. ${servingCount} ${servingSizeRaw}-mL Serving${servingCount !== 1 ? 's' : ''}`;
    servingCountEl.textContent = servingLabel;
    servingCountEl.style.display = 'block';
  } else {
    servingCountEl.textContent = batchLabel;
    servingCountEl.style.display = 'block';
  }
 
  // ---- Render results ----
 
  const recipeName = document.getElementById('recipe-name').value.trim() || 'Your Recipe';
  document.getElementById('results-drink-name').textContent = 'Slushy ' + recipeName;
 
  // Swap page title for the print filename. A single afterprint handler
  // (registered in init) restores ORIGINAL_TITLE, so repeated calculations
  // can't leave a stale recipe title behind.
  document.title = 'Slushy ' + recipeName + ' - The Simple Slushy Calculator';
 
  // Helper: build a list item with name + oz (mL)
  function makeIngredientLi(name, oz, ml, isAddition) {
    const li = document.createElement('li');
    li.className = 'results-ingredient-item' + (isAddition ? ' results-ingredient-addition' : '');
    li.innerHTML = `<span class="ing-name">${escapeHtml(name)}</span><span class="ing-amount">${oz.toFixed(2)} oz (${ml.toFixed(0)} mL)</span>`;
    return li;
  }
 
  // Original recipe list (for print) — unscaled amounts
  const originalList = document.getElementById('original-recipe-list');
  originalList.innerHTML = '';
  ingredients.forEach(ing => {
    const li = document.createElement('li');
    li.className = 'results-ingredient-item';
    li.innerHTML = `<span class="ing-name">${escapeHtml(ing.name)}</span><span class="ing-amount">${ing.oz.toFixed(2)} oz</span>`;
    originalList.appendChild(li);
  });
 
  // Scaled base recipe list
  const baseList = document.getElementById('scaled-base-list');
  baseList.innerHTML = '';
  scaledIngredients.forEach(ing => {
    baseList.appendChild(makeIngredientLi(ing.name, ing.oz, ing.ml, false));
  });
 
  // Additions list
  const additionsList  = document.getElementById('scaled-additions-list');
  const additionsBlock = document.getElementById('additions-block');
  additionsList.innerHTML = '';
 
  const hasSyrup = scaledSyrup > 0;
  const hasWater = scaledWater > 0;
 
  if (hasSyrup) {
    const ratio = S === BRIX_2TO1 ? '2:1' : '1:1';
    additionsList.appendChild(makeIngredientLi(`Simple Syrup (${ratio})`, scaledSyrup, ozToMl(scaledSyrup), true));
  }
  if (hasWater) {
    additionsList.appendChild(makeIngredientLi('Water', scaledWater, ozToMl(scaledWater), true));
  }
 
  additionsBlock.style.display = (hasSyrup || hasWater) ? 'block' : 'none';
 
  // Notices (e.g. no water added because the drink is already below target ABV)
  const warningsEl = document.getElementById('results-warnings');
  if (warningsEl) {
    warningsEl.textContent = '';
    warnings.forEach(msg => {
      const p = document.createElement('p');
      p.textContent = msg;
      warningsEl.appendChild(p);
    });
    warningsEl.style.display = warnings.length ? 'block' : 'none';
  }
 
  // Notes
  const notes = document.getElementById('recipe-notes').value.trim();
  const notesBlock = document.getElementById('results-notes-block');
  if (notes) {
    document.getElementById('results-notes-text').textContent = notes;
    notesBlock.style.display = 'block';
  } else {
    notesBlock.style.display = 'none';
  }
 
  const resultsEl = document.getElementById('results');
  resultsEl.style.display = 'block';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  resultsEl.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}
 
// ---- Utility ----
 
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
 
// ---- Init ----
 
document.addEventListener('DOMContentLoaded', () => {
 
  // Start with one ingredient row
  document.getElementById('ingredient-list').appendChild(createIngredientRow());
 
  // Add ingredient button
  document.getElementById('add-ingredient').addEventListener('click', () => {
    document.getElementById('ingredient-list').appendChild(createIngredientRow());
  });
 
  // Notes character counter
  const notesInput  = document.getElementById('recipe-notes');
  const notesCount  = document.getElementById('notes-char-count');
  notesInput.addEventListener('input', () => {
    const remaining = notesInput.maxLength - notesInput.value.length;
    notesCount.textContent = `${remaining} characters remaining`;
  });
 
  // Calculate button
  document.getElementById('calculate-btn').addEventListener('click', runCalculation);
 
  // Enter key on number inputs triggers calculation
  // (isComposing: don't fire while confirming an IME composition)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.target.matches('input[type="number"], input[type="text"]')) {
      runCalculation();
    }
  });
 
  // Restore the normal page title once the print dialog closes
  window.addEventListener('afterprint', () => {
    document.title = ORIGINAL_TITLE;
  });
});
 
