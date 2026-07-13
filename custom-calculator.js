/**
 * Calculates the cheapest combination of sheets to fulfill a customer's order.
 */
function optimizeSheetLayout(paperName, imgWidth, imgHeight, qty, cmsPriceData, hBleed, vBleed, gap, inkCostPerSqIn) {
    // 1. Filter and map capacities and costs

    const availableSheets = cmsPriceData
        .filter(item => item.paper === paperName)
        .map(item => {
            const dims = item.size.toLowerCase().split('x');
            const sheetW = parseFloat(dims[0].trim());
            const sheetH = parseFloat(dims[1].trim());

            const costPerSheet = item.costprice;
            
            const usableW = sheetW - (vBleed * 2);
            const usableH = sheetH - (hBleed * 2);

            let maxCapacity = 0;
            let bestOrientation = "Standard";

            if (usableW > 0 && usableH > 0) {
                const colsStandard = Math.floor((usableW + gap) / (imgWidth + gap));
                const rowsStandard = Math.floor((usableH + gap) / (imgHeight + gap));
                const fitStandard = Math.max(0, colsStandard) * Math.max(0, rowsStandard);
                
                const colsRotated = Math.floor((usableW + gap) / (imgHeight + gap));
                const rowsRotated = Math.floor((usableH + gap) / (imgWidth + gap));
                const fitRotated = Math.max(0, colsRotated) * Math.max(0, rowsRotated);
                
                if (fitRotated > fitStandard) {
                    maxCapacity = fitRotated;
                    bestOrientation = "Rotated";
                } else {
                    maxCapacity = fitStandard;
                    bestOrientation = "Standard";
                }
            }
            
            return {
                size: item.size,
                cost: costPerSheet,
                capacity: maxCapacity,
                orientation: bestOrientation
            };
        })
        .filter(item => item.capacity > 0);

    if (availableSheets.length === 0) {
        return {
            layout: "The requested image size is too large to fit on any available sheets with these margins.",
            cost: "",
            inkCostText: "",
            totalCost: "0.00"
        };
    }
    
    // 2. Dynamic Programming Array
    const dp = new Array(qty + 1).fill(Infinity);
    const choices = new Array(qty + 1).fill(null);
    dp[0] = 0; 
    
    for (let i = 0; i < qty; i++) {
        if (dp[i] === Infinity) continue;
        
        for (const sheet of availableSheets) {
            const nextIndex = Math.min(qty, i + sheet.capacity);
            const newCost = dp[i] + sheet.cost;
            
            if (newCost < dp[nextIndex]) {
                dp[nextIndex] = newCost;
                choices[nextIndex] = {
                    sheetSize: sheet.size,
                    orientation: sheet.orientation,
                    previousIndex: i,
                    photosAllocated: nextIndex - i,
                    capacity: sheet.capacity,
                    costPerSheet: sheet.cost
                };
            }
        }
    }

    if (choices[qty] === null) {
        return {
            layout: "Error: Could not calculate a valid layout.",
            cost: "-",
            inkCostText: "-",
            totalCost: "0.00"
        };
    }
    
    // 3. Backtrack to count up used sheets
    let currentIndex = qty;
    const usageSummary = {};
    
    while (currentIndex > 0) {
        const step = choices[currentIndex];
        const size = step.sheetSize;
        const allocated = step.photosAllocated; 
        
        if (!usageSummary[size]) {
            usageSummary[size] = { 
                totalSheetCount: 0, 
                costPerSheet: step.costPerSheet,
                orientation: step.orientation,
                layouts: {} 
            };
        }
        
        usageSummary[size].totalSheetCount += 1;
        
        if (!usageSummary[size].layouts[allocated]) {
            usageSummary[size].layouts[allocated] = 0;
        }
        usageSummary[size].layouts[allocated] += 1;
        
        currentIndex = step.previousIndex;
    }
    
    // 4. Format the final output strings and calculate Grand Total
    const layoutParts = [];
    
    Object.entries(usageSummary).forEach(([size, data]) => {
        Object.entries(data.layouts).forEach(([alloc, count]) => {
            const totalPhotosForThisGroup = count * parseInt(alloc, 10);
            layoutParts.push(`<strong>${size} (${data.orientation}): ${count}</strong> sheets x <strong>${alloc}</strong> ph/sh = <strong>${totalPhotosForThisGroup}</strong> phs`);
        });
    });
    
    let grandTotal = 0; 

    const costParts = Object.entries(usageSummary).map(([size, data]) => {
        const totalCost = data.totalSheetCount * data.costPerSheet;
        grandTotal += totalCost; 
        return `<strong>${size}:  ${data.totalSheetCount}</strong> sheets x <strong>$${data.costPerSheet.toFixed(2)}</strong>/sheet = <strong>$${totalCost.toFixed(2)}</strong>`;
    });

    const totalSqInches = imgWidth * imgHeight * qty;
    const totalInkCost = totalSqInches * inkCostPerSqIn;
    grandTotal += totalInkCost; 

    const inkCostText = `<strong>${totalSqInches}</strong> sq in X <strong>$${inkCostPerSqIn.toFixed(4)}</strong> = <strong>$${totalInkCost.toFixed(2)}</strong>`;
    
    return {
        layout: `${layoutParts.join('<br>')}`,
        cost: costParts.join('<br>'),
        inkCostText: inkCostText, 
        totalCost: grandTotal.toFixed(2) 
    };
}

/**
 * Calculates the most efficient layout and cost for a 24-inch continuous roll.
 */
function optimizeRollLayout(imgWidth, imgHeight, qty, hBleed, vBleed, gap, costPerLinearInch, inkCostPerSqIn) {
    // --- CHECK: Abort if the roll cost is missing, empty (NaN), 0, or negative ---
    if (!costPerLinearInch || isNaN(costPerLinearInch) || costPerLinearInch <= 0) {
        return {
            layout: "This paper type is not available as a continuous roll.",
            cost: "-",
            inkCostText: "-",
            totalCost: "0.00"
        };
    }

    const rollWidth = 24;
    
    // vBleed is Left/Right edges of the roll
    const usableW = rollWidth - (vBleed * 2);

    // 1. Calculate Standard Orientation
    let lengthStandard = Infinity;
    let colsStandard = 0;
    
    if (usableW > 0) {
        colsStandard = Math.floor((usableW + gap) / (imgWidth + gap));
        if (colsStandard > 0) {
            const rowsStandard = Math.ceil(qty / colsStandard);
            // hBleed is Top/Bottom edges of the final cut segment
            lengthStandard = (rowsStandard * (imgHeight + gap)) - gap + (hBleed * 2);
        }
    }

    // 2. Calculate Rotated Orientation (90 degrees)
    let lengthRotated = Infinity;
    let colsRotated = 0;
    
    if (usableW > 0) {
        colsRotated = Math.floor((usableW + gap) / (imgHeight + gap));
        if (colsRotated > 0) {
            const rowsRotated = Math.ceil(qty / colsRotated);
            // hBleed is Top/Bottom edges of the final cut segment
            lengthRotated = (rowsRotated * (imgWidth + gap)) - gap + (hBleed * 2);
        }
    }

    // 3. Catch error if the image is just too big for a 24" roll
    if (colsStandard === 0 && colsRotated === 0) {
        return {
            layout: "Image is too large to fit on a 24-inch roll with these margins.",
            cost: "",
            inkCostText: "",
            totalCost: "0.00"
        };
    }

    // 4. Determine the winner
    const isRotatedBetter = lengthRotated < lengthStandard;
    const bestLength = isRotatedBetter ? lengthRotated : lengthStandard;
    const bestCols = isRotatedBetter ? colsRotated : colsStandard;
    const orientation = isRotatedBetter ? "Rotated" : "Standard";

    // 5. Calculate Costs
    const paperCost = bestLength * costPerLinearInch;
    const totalSqInches = imgWidth * imgHeight * qty;
    const inkCost = totalSqInches * inkCostPerSqIn;
    const grandTotal = paperCost + inkCost;

    // 6. Format Strings
    const layoutText = `<strong>24" Roll (${orientation}):</strong> <strong>${bestCols}</strong> photos across. Total length: <strong>${bestLength.toFixed(2)}"</strong>`;
    const costText = `<strong>Roll Paper:</strong> ${bestLength.toFixed(2)}" x <strong>$${costPerLinearInch.toFixed(2)}</strong>/in = <strong>$${paperCost.toFixed(2)}</strong>`;
    const inkCostText = `<strong>${totalSqInches}</strong> sq in X <strong>$${inkCostPerSqIn.toFixed(4)}</strong> = <strong>$${inkCost.toFixed(2)}</strong>`;

    return {
        layout: layoutText,
        cost: costText,
        inkCostText: inkCostText,
        totalCost: grandTotal.toFixed(2)
    };
}

// Wait for the page to fully load before listening for clicks
document.addEventListener("DOMContentLoaded", function() {
    
    // 1. Find EVERY input field on the page that has a "data-value" attribute set in Webflow
    const allCmsInputs = document.querySelectorAll('input[data-value]');
  
    // 2. Loop through each one of them automatically
    allCmsInputs.forEach(function(input) {
        const cmsData = input.getAttribute("data-value");
        if (cmsData) {
            input.value = cmsData;
        }
    });

    const calculateBtn = document.getElementById("calculate-btn");
    
    if (calculateBtn) {
        calculateBtn.addEventListener("click", function(event) {
            event.preventDefault(); 
            
            const paperName = document.getElementById("paperSelect").value;
            const qty = parseInt(document.getElementById("qty").value, 10);
            
            // --- Dimension Selection Logic ---
            const sizeDropdown = document.getElementById("sizeSelect");
            let imgWidth, imgHeight;
            let requestedSizeString = ""; 

            const sizeVal = sizeDropdown && sizeDropdown.value ? sizeDropdown.value.trim().toLowerCase() : "";

            if (sizeVal !== "" && sizeVal !== "clear" && sizeVal.includes("x")) {
                requestedSizeString = sizeDropdown.value;
                const dims = sizeVal.split('x');
                imgWidth = parseFloat(dims[0].trim());
                imgHeight = parseFloat(dims[1].trim());
            } else {
                imgWidth = parseFloat(document.getElementById("ImgW").value);
                imgHeight = parseFloat(document.getElementById("ImgH").value);
                requestedSizeString = `${imgWidth}x${imgHeight}`;
            }
            
            // --- Sheet Bleeds & Gap ---
            const hBleed = parseFloat(document.getElementById("sheet-horizontal-bleed").value) || 0;
            const vBleed = parseFloat(document.getElementById("sheet-vertical-bleed").value) || 0;
            const gap = parseFloat(document.getElementById("gap-between-photos").value) || 0;

            // --- Roll Bleeds ---
            const r_hBleed = parseFloat(document.getElementById("roll-horizontal-bleed")?.value) || 0;
            const r_vBleed = parseFloat(document.getElementById("roll-vertical-bleed")?.value) || 0;

            // --- Ink Setup (Both Sheet and Roll) ---
            const inkInfoElement = document.querySelector('.ink-info');
            let sheetInkCostPerSqIn = inkInfoElement ? parseFloat(inkInfoElement.getAttribute('data-sheet-ink')) : 0;
            let rollInkCostPerSqIn = inkInfoElement ? parseFloat(inkInfoElement.getAttribute('data-roll-ink')) : 0;
            
            const isBW = document.getElementById("black-white") ? document.getElementById("black-white").checked : false;
            if (isBW && inkInfoElement) {
                const bwRatio = parseFloat(inkInfoElement.getAttribute('data-b-w-print-ratio')) || 1;
                sheetInkCostPerSqIn = sheetInkCostPerSqIn * bwRatio; 
                rollInkCostPerSqIn = rollInkCostPerSqIn * bwRatio;
            }

            // --- SAFE PARSING: Dynamic Roll Price Data by Paper Type ---
            const rollPriceElements = Array.from(document.querySelectorAll('.roll-price-info'));
            const matchedRollPriceEl = rollPriceElements.find(el => el.getAttribute('data-roll-paper') === paperName);
            
            // Extract attribute text, check for empty string values, and securely parse
            const rawRollPrice = matchedRollPriceEl ? matchedRollPriceEl.getAttribute('data-roll-cost-price-per-inch') : null;
            const costPerLinearInch = (rawRollPrice === null || rawRollPrice.trim() === "") ? 0 : parseFloat(rawRollPrice);
            
            // Validation
            if (!paperName || isNaN(qty)) {
                alert("Please fill out all required fields with valid numbers before calculating.");
                return;
            }

            // Parse CMS Sheet Data
            const cmsPriceData = Array.from(document.querySelectorAll('.price-item'))
                .map(el => ({
                    paper: el.dataset.paper,
                    size: el.dataset.size,
                    costprice: parseFloat(el.dataset.costprice)
                }))
                .filter(item => item.paper && item.size && !isNaN(item.costprice) && item.costprice > 0);
            
            // --- RUN BOTH FUNCTIONS ---
            const sheetResult = optimizeSheetLayout(paperName, imgWidth, imgHeight, qty, cmsPriceData, hBleed, vBleed, gap, sheetInkCostPerSqIn);
            const rollResult = optimizeRollLayout(imgWidth, imgHeight, qty, r_hBleed, r_vBleed, gap, costPerLinearInch, rollInkCostPerSqIn);
            
            // Push "Printing [Size]" info string
            const resultInfoDiv = document.getElementById("result-info");
            if (resultInfoDiv) resultInfoDiv.innerText = `Printing ${requestedSizeString}`;
            
            // Dynamic Ink Title Update
            const inkSheetTitleDiv = document.getElementById("ink-cost-sheet-title");
            if (inkSheetTitleDiv) inkSheetTitleDiv.innerText = isBW ? "Ink Cost (B&W rate applied):" : "Ink Cost:";

            const inkRollTitleDiv = document.getElementById("ink-cost-roll-title");
            if (inkRollTitleDiv) inkRollTitleDiv.innerText = isBW ? "Ink Cost (B&W rate applied):" : "Ink Cost:";

            // --- PUSH SHEET RESULTS TO DOM ---
            const layoutDiv = document.getElementById("sheets-layout");
            if (layoutDiv) layoutDiv.innerHTML = sheetResult.layout; 

            const costDiv = document.getElementById("sheets-cost-price");
            if (costDiv) costDiv.innerHTML = sheetResult.cost;

            const inkDiv = document.getElementById("sheet-ink-cost");
            if (inkDiv) inkDiv.innerHTML = sheetResult.inkCostText;

            const totalCostDiv = document.getElementById("total-sheets-cost-price");
            if (totalCostDiv) totalCostDiv.innerText = `$${sheetResult.totalCost}`;

            // --- PUSH ROLL RESULTS TO DOM ---
            const rollLayoutDiv = document.getElementById("roll-layout");
            if (rollLayoutDiv) rollLayoutDiv.innerHTML = rollResult.layout;

            const rollCostDiv = document.getElementById("roll-cost-price");
            if (rollCostDiv) rollCostDiv.innerHTML = rollResult.cost;

            const rollInkDiv = document.getElementById("roll-ink-cost");
            if (rollInkDiv) rollInkDiv.innerHTML = rollResult.inkCostText;

            const totalRollCostDiv = document.getElementById("total-roll-cost-price");
            if (totalRollCostDiv) totalRollCostDiv.innerText = `$${rollResult.totalCost}`;
        });
    }
});