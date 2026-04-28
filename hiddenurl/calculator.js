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

// ---- Unit conversions to ounces ----

function toOz(value, unit) {
  switch (unit) {
    case 'oz':  return value;
    case 'ml':  return value / 29.5735;
    case 'qt':  return value * 32;
    case 'gal': return value * 128;
    case 'l':   return value * 33.814;
    default:    return value;
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
    <div class="ingredient-row" role="group" aria-label="Ingredient ${id}">
      <input
        type="text"
        class="form-control ingredient-name"
        placeholder="Ingredient name"
        aria-label="Ingredient name"
        autocomplete="off"
      >
      <input
        type="number"
        class="form-control ingredient-quantity"
        placeholder="Qty"
        min="0"
        step="0.25"
        aria-label="Quantity"
      >
      <select class="form-select ingredient-unit" aria-label="Unit">
        <option value="oz">Ounces</option>
        <option value="ml">Milliliters</option>
      </select>
      <div class="input-group ingredient-abv-group">
        <input
          type="number"
          class="form-control ingredient-abv"
          placeholder="ABV"
          min="0"
          max="100"
          step="0.5"
          aria-label="ABV percent"
        >
        <span class="input-group-text">%</span>
      </div>
      <button
        type="button"
        class="btn btn-outline-danger btn-sm btn-remove"
        aria-label="Remove this ingredient"
      >&times;</button>
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

  for (const row of rows) {
    const name = row.querySelector('.ingredient-name').value.trim();
    const qty  = parseFloat(row.querySelector('.ingredient-quantity').value);
    const unit = row.querySelector('.ingredient-unit').value;
    const abv  = parseFloat(row.querySelector('.ingredient-abv').value);

    if (!name && isNaN(qty)) continue; // skip completely empty rows

    if (!name) {
      showError('One or more ingredients is missing a name.');
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      showError(`"${name}" has an invalid quantity. Please enter a number greater than zero.`);
      return;
    }
    if (isNaN(abv) || abv < 0 || abv > 100) {
      showError(`"${name}" has an invalid ABV. Please enter a number between 0 and 100.`);
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
    showError('Please enter a valid refractometer reading (0–100).');
    return;
  }

  // --- S: syrup Brix ---
  const S = parseFloat(document.querySelector('input[name="syrup-type"]:checked').value);

  // --- Machine volume ---
  const machineVolumeRaw  = parseFloat(document.getElementById('machine-volume').value);
  const machineVolumeUnit = document.getElementById('machine-unit').value;
  if (isNaN(machineVolumeRaw) || machineVolumeRaw <= 0) {
    showError('Please enter a valid machine volume greater than zero.');
    return;
  }
  const M = toOz(machineVolumeRaw, machineVolumeUnit);

  // --- Step 2: Correct Brix for alcohol ---
  const Bc = A === 0 ? B : B - (BRIX_CORRECTION * A);

  // --- Step 3: Choose path ---
  let Fv, Sv, Wv, pathLabel, warnings = [];

  const isNonAlcoholic = A === 0;
  const belowTargetBrix = Bc < TARGET_BRIX;

  if (isNonAlcoholic || belowTargetBrix) {
    // PATH 3 — Syrup-Only
    pathLabel = 'Path 3 (syrup addition only)';
    Sv = V * (TARGET_BRIX - Bc) / (S - TARGET_BRIX);
    Fv = V + Sv;
    Wv = 0;

  } else {
    const ratio = (A * TARGET_BRIX) / Bc;

    if (ratio <= TARGET_ABV) {
      // PATH 1 — Brix-First
      pathLabel = 'Path 1 (water dilution)';
      Fv = V * Bc / TARGET_BRIX;
      Sv = 0;
      Wv = Fv - V;

      if (Wv < 0) {
        // Route to Path 3 instead
        pathLabel = 'Path 3 (syrup addition only — Brix below target after dilution check)';
        Sv = V * (TARGET_BRIX - Bc) / (S - TARGET_BRIX);
        Fv = V + Sv;
        Wv = 0;
      }

    } else {
      // PATH 2 — ABV-First
      pathLabel = 'Path 2 (ABV-first with syrup correction)';
      Fv = (A * V) / TARGET_ABV;
      Sv = (TARGET_BRIX * Fv - Bc * V) / S;
      Wv = Fv - V - Sv;

      if (Sv < 0) {
        Sv = 0;
        Wv = Fv - V;
        warnings.push('Brix is approximate — no syrup addition required, but the final Brix may differ slightly from target.');
      }
      if (Wv < 0) {
        Wv = 0;
        warnings.push('ABV will be slightly below 9% — the formula hit a water floor. The drink will still freeze correctly.');
      }
    }
  }

  // --- Step 4: Scale to machine volume ---
  if (Fv <= 0) {
    showError('Final volume calculation produced an invalid result. Please check your inputs.');
    return;
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
  const scaledFv    = Fv * scale;

  // ---- Render results ----

  const recipeName = document.getElementById('recipe-name').value.trim() || 'Your Recipe';
  document.getElementById('results-drink-name').textContent = recipeName;
  document.getElementById('results-path-note').textContent  = pathLabel + (warnings.length ? ' — ' + warnings.join(' ') : '');

  // What to add
  document.getElementById('result-syrup').textContent      = scaledSyrup > 0 ? scaledSyrup.toFixed(2) : '0';
  document.getElementById('result-syrup-unit').textContent = scaledSyrup > 0 ? `oz / ${ozToMl(scaledSyrup).toFixed(1)} mL` : '';
  document.getElementById('result-water').textContent      = scaledWater > 0 ? scaledWater.toFixed(2) : '0';
  document.getElementById('result-water-unit').textContent = scaledWater > 0 ? `oz / ${ozToMl(scaledWater).toFixed(1)} mL` : '';

  // Final numbers
  document.getElementById('result-fv').textContent  = scaledFv.toFixed(2);
  document.getElementById('result-abv').textContent = A > 0 ? TARGET_ABV.toFixed(1) : '0';

  // Scaled recipe table
  const tbody = document.getElementById('scaled-tbody');
  tbody.innerHTML = '';

  scaledIngredients.forEach(ing => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(ing.name)}</td>
      <td class="text-end">${ing.oz.toFixed(2)}</td>
      <td class="text-end">${ing.ml.toFixed(1)}</td>
    `;
    tbody.appendChild(tr);
  });

  if (scaledSyrup > 0) {
    const syrupLabel = S === BRIX_2TO1 ? '2:1 simple syrup' : '1:1 simple syrup';
    const tr = document.createElement('tr');
    tr.className = 'row-addition';
    tr.innerHTML = `
      <td>${syrupLabel}</td>
      <td class="text-end">${scaledSyrup.toFixed(2)}</td>
      <td class="text-end">${ozToMl(scaledSyrup).toFixed(1)}</td>
    `;
    tbody.appendChild(tr);
  }

  if (scaledWater > 0) {
    const tr = document.createElement('tr');
    tr.className = 'row-addition';
    tr.innerHTML = `
      <td>Water</td>
      <td class="text-end">${scaledWater.toFixed(2)}</td>
      <td class="text-end">${ozToMl(scaledWater).toFixed(1)}</td>
    `;
    tbody.appendChild(tr);
  }

  document.getElementById('results').style.display = 'block';
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  // Column headers for ingredient table
  const colHeaders = document.createElement('div');
  colHeaders.className = 'ingredient-col-headers';
  colHeaders.innerHTML = `
    <span class="col-hdr-name">Ingredient</span>
    <span class="col-hdr-qty">Qty</span>
    <span class="col-hdr-unit">Unit</span>
    <span class="col-hdr-abv">ABV</span>
    <span class="col-hdr-del"></span>
  `;
  document.getElementById('ingredient-list').before(colHeaders);

  // Start with one ingredient row
  document.getElementById('ingredient-list').appendChild(createIngredientRow());

  // Add ingredient button
  document.getElementById('add-ingredient').addEventListener('click', () => {
    document.getElementById('ingredient-list').appendChild(createIngredientRow());
  });

  // Calculate button
  document.getElementById('calculate-btn').addEventListener('click', runCalculation);

  // Enter key on number inputs triggers calculation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input[type="number"], input[type="text"]')) {
      runCalculation();
    }
  });
});
