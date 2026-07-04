
/**
 * Calculates the cheapest combination of sheets to fulfill a customer's order.
 * 
 * @param {string} paperName - The name of the paper (e.g., "Premium Matte")
 * @param {number} imgWidth - Customer's requested image width in inches
 * @param {number} imgHeight - Customer's requested image height in inches
 * @param {number} qty - Total number of prints ordered
 * @param {Array} cmsPriceData - Array of your Webflow CMS paper objects
 * @returns {string} Human-readable best layout string
 */
function optimizeSheetLayout(paperName, imgWidth, imgHeight, qty, cmsPriceData) {
    
    // 1. Filter for the requested paper and map out capacities and costs
    const availableSheets = cmsPriceData
        .filter(item => item.paper === paperName)
        .map(item => {
            // Parse dimensions (e.g., "13x19" -> width: 13, height: 19)
            const dims = item.size.toLowerCase().split('x');
            const sheetW = parseFloat(dims[0].trim());
            const sheetH = parseFloat(dims[1].trim());

            console.log(sheetW, sheetH);
            // Calculate exact cost for a single sheet
            const costPerSheet = item.cost_price / item.sheets;
            
            // Check grid fit (testing both standard and 90-degree rotated orientations)
            const fitStandard = Math.floor(sheetW / imgWidth) * Math.floor(sheetH / imgHeight);
            const fitRotated = Math.floor(sheetW / imgHeight) * Math.floor(sheetH / imgWidth);
            const maxCapacity = Math.max(fitStandard, fitRotated);
            console.log(fitStandard, fitRotated, test2);
            return {
                size: item.size,
                cost: costPerSheet,
                capacity: maxCapacity
            };
        })
        .filter(item => item.capacity > 0); // Drop sheets that are too small for the image

        console.log(availableSheets);

    if (availableSheets.length === 0) {
        return "The requested image size is too large to fit on any available sheets.";
    }
    
    // 2. Dynamic Programming Array to find the absolute minimum cost path
    // dp[i] will store the minimum cost required to print exactly 'i' photos
    const dp = new Array(qty + 1).fill(Infinity);
    const choices = new Array(qty + 1).fill(null);
    dp[0] = 0; // Cost to print 0 photos is $0
    
    // Loop through every quantity up to the total needed
    for (let i = 0; i < qty; i++) {
        if (dp[i] === Infinity) continue;
        
        for (const sheet of availableSheets) {
            // How many total photos will we have if we use this sheet? (Capped at requested qty)
            const nextIndex = Math.min(qty, i + sheet.capacity);
            const newCost = dp[i] + sheet.cost;
            
            // If this sheet combination is cheaper than a previous calculation, save it
            if (newCost < dp[nextIndex]) {
                dp[nextIndex] = newCost;
                choices[nextIndex] = {
                    sheetSize: sheet.size,
                    previousIndex: i,
                    photosAllocated: nextIndex - i 
                };
            }
        }
    }
    
    // 3. Backtrack through our saved choices to see which sheets actually won
    let currentIndex = qty;
    const usageSummary = {};
    
    while (currentIndex > 0) {
        const step = choices[currentIndex];
        const size = step.sheetSize;
        
        if (!usageSummary[size]) {
            usageSummary[size] = { sheetCount: 0, photos: 0 };
        }
        
        usageSummary[size].sheetCount += 1;
        usageSummary[size].photos += step.photosAllocated;
        
        currentIndex = step.previousIndex;
    }
    
    // 4. Format the final output string
    const resultParts = Object.entries(usageSummary).map(([size, data]) => {
        return `${data.photos} photos on ${data.sheetCount} sheet(s) of ${size} size`;
    });
    
    return `Best way to print is to fit ${resultParts.join(' and ')}.`;
}




// Wait for the page to fully load before listening for clicks
document.addEventListener("DOMContentLoaded", function() {
    
    // 1. Find the button and listen for a click
    const calculateBtn = document.getElementById("calculate-btn");
    
    calculateBtn.addEventListener("click", function(event) {
        // Prevent the page from refreshing if the button is inside a form
        event.preventDefault(); 
        
        // 2. Grab the live values from the user's input fields
        const paperName = document.getElementById("paperSelect").value;
        const imgWidth = parseFloat(document.getElementById("ImgW").value);
        const imgHeight = parseFloat(document.getElementById("ImgH").value);
        const qty = parseInt(document.getElementById("qty").value, 10);
        
        // 3. Simple error checking to make sure they didn't leave a field blank
        if (!paperName || isNaN(imgWidth) || isNaN(imgHeight) || isNaN(qty)) {
            alert("Please fill out all fields with valid numbers before calculating.");
            return;
        }

        // 4. Your Webflow CMS Data Array 
        // (You will need to populate this dynamically using Webflow CMS collection lists)
        const cmsPriceData = [
            { paper: "Matte", size: "13x19", cost_price: 20.00, sheets: 50 },
            { paper: "Matte", size: "4x6", cost_price: 10.00, sheets: 100 },
            { paper: "Glossy", size: "13x19", cost_price: 60.00, sheets: 50 }
        ];

        // 5. Run our optimization algorithm using the inputs
        const finalRecommendation = optimizeSheetLayout(paperName, imgWidth, imgHeight, qty, cmsPriceData);
        
        // 6. Display the result on the screen 
        // (Assuming you have a text block with the ID "result-text" to show the answer)
        const resultDiv = document.getElementById("result-text");
        if (resultDiv) {
            resultDiv.innerText = finalRecommendation;
        } else {
            // Fallback if you haven't built the result text element yet
            console.log(finalRecommendation);
            alert(finalRecommendation);
        }
    });
});
