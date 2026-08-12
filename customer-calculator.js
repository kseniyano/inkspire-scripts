/**
 * Calculates ONLY the raw base cost for sheets (no layout strings generated).
 * Returns null if the layout is impossible.
 */
function getSheetBaseCost(paperName, imgWidth, imgHeight, qty, cmsPriceData, hBleed, vBleed, gap, inkCostPerSqIn) {
    const availableSheets = cmsPriceData
        .filter(item => item.paper === paperName)
        .map(item => {
            const dims = item.size.toLowerCase().split('x');
            const sheetW = parseFloat(dims[0].trim());
            const sheetH = parseFloat(dims[1].trim());

            const usableW = sheetW - (vBleed * 2);
            const usableH = sheetH - (hBleed * 2);

            let maxCapacity = 0;

            if (usableW > 0 && usableH > 0) {
                const colsStandard = Math.floor((usableW + gap) / (imgWidth + gap));
                const rowsStandard = Math.floor((usableH + gap) / (imgHeight + gap));
                const fitStandard = Math.max(0, colsStandard) * Math.max(0, rowsStandard);
                
                const colsRotated = Math.floor((usableW + gap) / (imgHeight + gap));
                const rowsRotated = Math.floor((usableH + gap) / (imgWidth + gap));
                const fitRotated = Math.max(0, colsRotated) * Math.max(0, rowsRotated);
                
                maxCapacity = Math.max(fitStandard, fitRotated);
            }
            
            return {
                cost: item.costprice,
                capacity: maxCapacity
            };
        })
        .filter(item => item.capacity > 0);

    // Abort if no sheets can fit the image
    if (availableSheets.length === 0) return null;
    
    // Dynamic Programming just to find the lowest cost
    const dp = new Array(qty + 1).fill(Infinity);
    dp[0] = 0; 
    
    for (let i = 0; i < qty; i++) {
        if (dp[i] === Infinity) continue;
        
        for (const sheet of availableSheets) {
            const nextIndex = Math.min(qty, i + sheet.capacity);
            const newCost = dp[i] + sheet.cost;
            if (newCost < dp[nextIndex]) {
                dp[nextIndex] = newCost;
            }
        }
    }
    
    // If we couldn't reach the target quantity, return null
    if (dp[qty] === Infinity) return null;

    const totalSqInches = imgWidth * imgHeight * qty;
    const totalInkCost = totalSqInches * inkCostPerSqIn;
    
    return dp[qty] + totalInkCost; 
}

/**
 * Calculates ONLY the raw base cost for the roll.
 * Returns null if the layout is impossible or roll is unavailable.
 */
function getRollBaseCost(imgWidth, imgHeight, qty, hBleed, vBleed, gap, costPerLinearInch, inkCostPerSqIn) {
    if (!costPerLinearInch || isNaN(costPerLinearInch) || costPerLinearInch <= 0) {
        return null; // Not available as a roll
    }

    const rollWidth = 24;
    const usableW = rollWidth - (vBleed * 2);

    let lengthStandard = Infinity;
    let colsStandard = 0;
    if (usableW > 0) {
        colsStandard = Math.floor((usableW + gap) / (imgWidth + gap));
        if (colsStandard > 0) {
            const rowsStandard = Math.ceil(qty / colsStandard);
            lengthStandard = (rowsStandard * (imgHeight + gap)) - gap + (hBleed * 2);
        }
    }

    let lengthRotated = Infinity;
    let colsRotated = 0;
    if (usableW > 0) {
        colsRotated = Math.floor((usableW + gap) / (imgHeight + gap));
        if (colsRotated > 0) {
            const rowsRotated = Math.ceil(qty / colsRotated);
            lengthRotated = (rowsRotated * (imgWidth + gap)) - gap + (hBleed * 2);
        }
    }

    if (colsStandard === 0 && colsRotated === 0) return null; // Image too large

    const bestLength = Math.min(lengthStandard, lengthRotated);
    
    const paperCost = bestLength * costPerLinearInch;
    const totalSqInches = imgWidth * imgHeight * qty;
    const inkCost = totalSqInches * inkCostPerSqIn;
    
    return paperCost + inkCost;
}

// Wait for page to load
document.addEventListener("DOMContentLoaded", function() {
    
    const calculateBtn = document.getElementById("calculate-btn");
    
    if (calculateBtn) {
        
        // --- Trigger calculation on Enter key ---
        document.addEventListener("keydown", function(event) {
            if (event.key === "Enter") {
                event.preventDefault(); 
                calculateBtn.click();   
            }
        });

        calculateBtn.addEventListener("click", function(event) {
            event.preventDefault(); 
            
            const paperName = document.getElementById("paperSelect").value;
            
            // --- Quantity Logic (Must be integer, defaults to 1) ---
            const qtyInput = document.getElementById("qty");
            let qty = parseInt(qtyInput.value, 10);
            if (isNaN(qty) || qty < 1) {
                qty = 1;
                qtyInput.value = 1; // Updates the field visually for the user
            }
            
            // --- Dimension Logic ---
            const sizeDropdown = document.getElementById("sizeSelect");
            let imgWidth, imgHeight;

            const sizeVal = sizeDropdown && sizeDropdown.value ? sizeDropdown.value.trim().toLowerCase() : "";

            if (sizeVal !== "" && sizeVal !== "clear" && sizeVal.includes("x")) {
                const dims = sizeVal.split('x');
                imgWidth = parseFloat(dims[0].trim());
                imgHeight = parseFloat(dims[1].trim());
            } else {
                imgWidth = parseFloat(document.getElementById("ImgW").value);
                imgHeight = parseFloat(document.getElementById("ImgH").value);
            }
            
            // Validation step
            if (!paperName || isNaN(imgWidth) || isNaN(imgHeight)) {
                alert("Please fill out all required fields with valid numbers before calculating.");
                return;
            }

            // --- Read from the centralized .print-settings element ---
            const settingsEl = document.querySelector('.print-settings');
            
            let sheetVBleed = 0, sheetHBleed = 0, rollVBleed = 0, rollHBleed = 0;
            let gap = 0, sheetInk = 0, rollInk = 0, markup = 1;
            
            if (settingsEl) {
                sheetVBleed = parseFloat(settingsEl.getAttribute('data-sheet-v-bleed')) || 0;
                sheetHBleed = parseFloat(settingsEl.getAttribute('data-sheet-h-bleed')) || 0;
                rollVBleed = parseFloat(settingsEl.getAttribute('data-roll-v-bleed')) || 0;
                rollHBleed = parseFloat(settingsEl.getAttribute('data-roll-h-bleed')) || 0;
                gap = parseFloat(settingsEl.getAttribute('data-gap')) || 0;
                sheetInk = parseFloat(settingsEl.getAttribute('data-sheet-ink')) || 0;
                rollInk = parseFloat(settingsEl.getAttribute('data-roll-ink')) || 0;
                markup = parseFloat(settingsEl.getAttribute('data-markup')) || 1;
            } else {
                console.warn("Could not find the .print-settings element.");
            }

            // --- Parse CMS Price Data ---
            const cmsPriceData = Array.from(document.querySelectorAll('.price-item'))
                .map(el => ({
                    paper: el.getAttribute('data-paper'),
                    size: el.getAttribute('data-size'),
                    costprice: parseFloat(el.getAttribute('data-costprice'))
                }))
                .filter(item => item.paper && item.size && !isNaN(item.costprice) && item.costprice > 0);
            
            const rollPriceElements = Array.from(document.querySelectorAll('.roll-price-info'));
            const matchedRollPriceEl = rollPriceElements.find(el => el.getAttribute('data-roll-paper') === paperName);
            
            const rawRollPrice = matchedRollPriceEl ? matchedRollPriceEl.getAttribute('data-roll-cost-price-per-inch') : null;
            const costPerLinearInch = (rawRollPrice === null || rawRollPrice.trim() === "") ? 0 : parseFloat(rawRollPrice);
            
            // --- Run Math ---
            const baseSheetCost = getSheetBaseCost(paperName, imgWidth, imgHeight, qty, cmsPriceData, sheetHBleed, sheetVBleed, gap, sheetInk);
            const baseRollCost = getRollBaseCost(imgWidth, imgHeight, qty, rollHBleed, rollVBleed, gap, costPerLinearInch, rollInk);
            
            // --- Output to the DOM (Applying Markup) ---
            const totalSheetsDiv = document.getElementById("total-sheets");
            if (totalSheetsDiv) {
                if (baseSheetCost !== null) {
                    // Note: Change .toFixed(2) to .toFixed(0) if you want flat dollar amounts without cents
                    totalSheetsDiv.innerText = `$${(baseSheetCost * markup).toFixed(2)}`;
                } else {
                    totalSheetsDiv.innerText = "-";
                }
            }

            const totalRollDiv = document.getElementById("total-roll");
            if (totalRollDiv) {
                if (baseRollCost !== null) {
                    totalRollDiv.innerText = `$${(baseRollCost * markup).toFixed(2)}`;
                } else {
                    totalRollDiv.innerText = "-";
                }
            }
        });
    }
});