/**
 * Calculates ONLY the raw base cost for sheets.
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

    if (availableSheets.length === 0) return null;
    
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
        return null; 
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

    if (colsStandard === 0 && colsRotated === 0) return null; 

    const bestLength = Math.min(lengthStandard, lengthRotated);
    
    const paperCost = bestLength * costPerLinearInch;
    const totalSqInches = imgWidth * imgHeight * qty;
    const inkCost = totalSqInches * inkCostPerSqIn;
    
    return paperCost + inkCost;
}

// === MAIN DOM LOGIC ===
document.addEventListener("DOMContentLoaded", () => {
    
    // 1. Grab UI elements for animation
    const container = document.getElementById("price-container");
    const originalRow = document.getElementById("price-row");
    const originalError = document.getElementById("error-row");
    const button = document.getElementById("calculate-btn");
    const initial = document.getElementById("price-initial");

    // Inputs
    const sizeSelect = document.getElementById("sizeSelect");
    const paperSelect = document.getElementById("paperSelect");
    const qtyInput = document.getElementById("qty");

    let currentRow = null;
    let firstClick = true;

    // 2. Animation helper
    function animateSwap(newEl) {
        newEl.style.position = "absolute";
        newEl.classList.remove("hide");
        container.appendChild(newEl);

        gsap.set(newEl, { yPercent: 100, opacity: 0 });
        const tl = gsap.timeline({ defaults: { duration: 0.4, ease: "power2.out" } });

        if (firstClick) {
            tl.to(initial, { yPercent: -100, opacity: 0 }, 0);
            tl.to(newEl, { yPercent: 0, opacity: 1 }, 0);
            tl.add(() => {
                initial.remove();
                currentRow = newEl;
                firstClick = false;
            });
        } else {
            tl.to(currentRow, { yPercent: -100, opacity: 0 }, 0);
            tl.to(newEl, { yPercent: 0, opacity: 1 }, 0);
            tl.add(() => {
                currentRow.remove();
                currentRow = newEl;
            });
        }
    }

    // 3. Create cloned rows
    function createClonedPriceRow(finalTotal, qty, requestedSizeString) {
        const newRow = originalRow.cloneNode(true);
        newRow.removeAttribute("id");

        // Update Printing Size string
        const printingSizeEl = newRow.querySelector("#printing-size") || document.getElementById("printing-size");
        if (printingSizeEl && requestedSizeString) {
            printingSizeEl.textContent = `Printing ${requestedSizeString}`;
        }

        // Map Final Total to #total-price
        const totalEl = newRow.querySelector("#total-price");
        if (totalEl) {
            // If qty is 1, always round UP. Otherwise, round to nearest integer.
            if (qty === 1) {
                totalEl.textContent = `$${Math.ceil(finalTotal)}`;
            } else {
                totalEl.textContent = `$${finalTotal.toFixed(0)}`;
            }
        }

        // Map Per Image Total to #per-img (Decimal with 1 digit) & Hide if qty === 1
        const perImgWrap = newRow.querySelector("#per-img-wrap");
        const perImgEl = newRow.querySelector("#per-img");
        
        if (qty === 1) {
            if (perImgWrap) perImgWrap.style.display = "none";
        } else {
            if (perImgWrap) perImgWrap.style.display = ""; // Resets display if previously hidden
            if (perImgEl) {
                const perImagePrice = finalTotal / qty;
                perImgEl.textContent = `$${perImagePrice.toFixed(1)}`;
            }
        }

        return newRow;
    }

    function createClonedErrorRow(message) {
        const newRow = originalError.cloneNode(true);
        newRow.removeAttribute("id");
        const msg = newRow.querySelector(".error-message");
        if (msg) msg.textContent = message || "Please check your inputs";
        return newRow;
    }

    // 4. Trigger on Enter Key
    if (button) {
        document.addEventListener("keydown", function(event) {
            if (event.key === "Enter") {
                event.preventDefault(); 
                button.click();   
            }
        });

        // 5. Button Click Logic
        button.addEventListener("click", (event) => {
            event.preventDefault();

            const paperName = paperSelect ? paperSelect.value : "";
            
            // Qty logic
            let qty = parseInt(qtyInput.value, 10);
            if (isNaN(qty) || qty < 1) {
                qty = 1;
                if (qtyInput) {
                    qtyInput.value = 1;
                    qtyInput.dispatchEvent(new Event('input', { bubbles: true })); 
                }
            }

            // --- Dimension logic (dropdown vs manual inputs conflict check) ---
            const sizeVal = sizeSelect && sizeSelect.value ? sizeSelect.value.trim().toLowerCase() : "";
            
            const manualWEl = document.getElementById("ImgW");
            const manualHEl = document.getElementById("ImgH");
            const manualWVal = manualWEl ? manualWEl.value.trim() : "";
            const manualHVal = manualHEl ? manualHEl.value.trim() : "";

            // Check if BOTH methods have data entered
            const hasDropdownSize = sizeVal !== "" && sizeVal !== "clear" && sizeVal.includes("x");
            const hasManualSize = manualWVal !== "" || manualHVal !== "";

            if (hasDropdownSize && hasManualSize) {
                animateSwap(createClonedErrorRow("Choose either a Common or Custom size. Select 'Clear' for custom."));
                return;
            }

            // Assign values based on which one they actually used
            let imgWidth, imgHeight, requestedSizeString = "";

            if (hasDropdownSize) {
                requestedSizeString = sizeSelect.options[sizeSelect.selectedIndex].text || sizeSelect.value;
                const dims = sizeVal.split('x');
                imgWidth = parseFloat(dims[0].trim());
                imgHeight = parseFloat(dims[1].trim());
            } else {
                imgWidth = parseFloat(manualWVal);
                imgHeight = parseFloat(manualHVal);
                if (!isNaN(imgWidth) && !isNaN(imgHeight)) {
                    requestedSizeString = `${imgWidth}x${imgHeight}`;
                }
            }

            // Validation
            if (!paperName || paperName.toLowerCase().includes("select") || isNaN(imgWidth) || isNaN(imgHeight)) {
                animateSwap(createClonedErrorRow("Please complete all required fields"));
                return;
            }

            // Parse CMS Settings
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
            }

            // Parse CMS Sheets Data
            const cmsPriceData = Array.from(document.querySelectorAll('.price-item'))
                .map(el => ({
                    paper: el.getAttribute('data-paper') || el.dataset.paper,
                    size: el.getAttribute('data-size') || el.dataset.size,
                    costprice: parseFloat(el.getAttribute('data-costprice') || el.dataset.costprice)
                }))
                .filter(item => item.paper && item.size && !isNaN(item.costprice) && item.costprice > 0);
            
            // Parse CMS Roll Data
            const rollPriceElements = Array.from(document.querySelectorAll('.roll-price-info'));
            const matchedRollPriceEl = rollPriceElements.find(el => {
                return (el.getAttribute('data-roll-paper') || el.dataset.rollPaper) === paperName;
            });
            
            const rawRollPrice = matchedRollPriceEl ? (matchedRollPriceEl.getAttribute('data-roll-cost-price-per-inch') || matchedRollPriceEl.dataset.rollCostPricePerInch) : null;
            const costPerLinearInch = (rawRollPrice === null || rawRollPrice.trim() === "") ? 0 : parseFloat(rawRollPrice);

            // Execute Math Functions
            const baseSheetCost = getSheetBaseCost(paperName, imgWidth, imgHeight, qty, cmsPriceData, sheetHBleed, sheetVBleed, gap, sheetInk);
            const baseRollCost = getRollBaseCost(imgWidth, imgHeight, qty, rollHBleed, rollVBleed, gap, costPerLinearInch, rollInk);
            
            // Check if BOTH are completely invalid/impossible
            if (baseSheetCost === null && baseRollCost === null) {
                
                // --- NEW: Custom Error if no roll is available for this paper ---
                if (costPerLinearInch === 0) {
                    const availableSheetsForPaper = cmsPriceData.filter(item => item.paper === paperName);
                    
                    if (availableSheetsForPaper.length > 0) {
                        let maxArea = 0;
                        let maxSizeStr = "";
                        
                        // Find the largest sheet we carry for this paper
                        availableSheetsForPaper.forEach(sheet => {
                            const dims = sheet.size.toLowerCase().split('x');
                            const w = parseFloat(dims[0].trim());
                            const h = parseFloat(dims[1].trim());
                            if (!isNaN(w) && !isNaN(h)) {
                                const area = w * h;
                                if (area > maxArea) {
                                    maxArea = area;
                                    maxSizeStr = sheet.size;
                                }
                            }
                        });

                        if (maxSizeStr) {
                            animateSwap(createClonedErrorRow(`The maximum size we can print on this paper is ${maxSizeStr}`));
                            return;
                        }
                    }
                }

                // Default error if roll exists but request exceeds 24"
                animateSwap(createClonedErrorRow("At least one dimension must be 24 inches or less"));
                return;
            }

            // Calculate Customer Pricing with Markup
            const customerSheetTotal = baseSheetCost !== null ? (baseSheetCost * markup) : null;
            const customerRollTotal = baseRollCost !== null ? (baseRollCost * markup) : null;

            // --- Pricing Logic (Size Check & Max Value) ---
            let finalPrice = 0;
            const minDim = Math.min(imgWidth, imgHeight);
            const maxDim = Math.max(imgWidth, imgHeight);
            const isSmallFormat = (minDim <= 11 && maxDim <= 17);

            if (isSmallFormat) {
                // For 11x17 or smaller: Use Sheets, fallback to Roll if Sheets are unavailable
                if (customerSheetTotal !== null) {
                    finalPrice = customerSheetTotal;
                } else {
                    finalPrice = customerRollTotal;
                }
            } else {
                // For larger than 11x17: Take whichever price is MORE
                if (customerSheetTotal !== null && customerRollTotal !== null) {
                    finalPrice = Math.max(customerSheetTotal, customerRollTotal);
                } else if (customerSheetTotal !== null) {
                    finalPrice = customerSheetTotal;
                } else {
                    finalPrice = customerRollTotal;
                }
            }

            // Trigger the GSAP Swap with the single final price
            animateSwap(createClonedPriceRow(finalPrice, qty, requestedSizeString));
        });
    }
});