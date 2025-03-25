// Swiss Mortgage Calculator
// Core calculation and simulation logic - Part 1: UI and Setup

document.addEventListener('DOMContentLoaded', function() {
    // UI Elements
    const calculateBtn = document.getElementById('calculateBtn');
    const tabs = document.querySelectorAll('.tab');
    
    // Initialize tabs
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
        });
    });
    
    // Initialize calculate button
    calculateBtn.addEventListener('click', runCalculation);
    
    // Initialize with default values
    updateInputsFromUrlParams();
});

// Function to update input values from URL parameters
function updateInputsFromUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    
    const paramMapping = {
        'loan': 'loanAmount',
        'years': 'projectionYears',
        'saron': 'saronRate',
        'margin': 'saronMargin',
        'fixed2y': 'fixedRate2y',
        'fixed5y': 'fixedRate5y',
        'fixed10y': 'fixedRate10y',
        'sims': 'numSimulations',
        'reversion': 'meanReversion',
        'vol': 'volatility',
        'mean': 'longTermMean'
    };
    
    for (const [param, inputId] of Object.entries(paramMapping)) {
        if (urlParams.has(param)) {
            const input = document.getElementById(inputId);
            if (input) {
                input.value = urlParams.get(param);
            }
        }
    }
    
    // If there are parameters, run the calculation automatically
    if (urlParams.size > 0) {
        runCalculation();
    }
}

// Main calculation function
function runCalculation() {
    // Get input values
    const loanAmount = parseFloat(document.getElementById('loanAmount').value);
    const projectionYears = parseInt(document.getElementById('projectionYears').value);
    const currentSaronRate = parseFloat(document.getElementById('saronRate').value) / 100;
    const saronMargin = parseFloat(document.getElementById('saronMargin').value) / 100;
    const fixedRate2y = parseFloat(document.getElementById('fixedRate2y').value) / 100;
    const fixedRate5y = parseFloat(document.getElementById('fixedRate5y').value) / 100;
    const fixedRate10y = parseFloat(document.getElementById('fixedRate10y').value) / 100;
    const numSimulations = parseInt(document.getElementById('numSimulations').value);
    const meanReversion = parseFloat(document.getElementById('meanReversion').value);
    const volatility = parseFloat(document.getElementById('volatility').value) / 100;
    const longTermMean = parseFloat(document.getElementById('longTermMean').value) / 100;
    
    // Update URL parameters for sharing
    updateUrlParams({
        loan: loanAmount,
        years: projectionYears,
        saron: (currentSaronRate * 100).toFixed(2),
        margin: (saronMargin * 100).toFixed(2),
        fixed2y: (fixedRate2y * 100).toFixed(2),
        fixed5y: (fixedRate5y * 100).toFixed(2),
        fixed10y: (fixedRate10y * 100).toFixed(2),
        sims: numSimulations,
        reversion: meanReversion.toFixed(2),
        vol: (volatility * 100).toFixed(1),
        mean: (longTermMean * 100).toFixed(1)
    });
    
    // Run simulation
    const simulationResults = runMortgageSimulation(
        loanAmount, projectionYears, currentSaronRate, saronMargin,
        fixedRate2y, fixedRate5y, fixedRate10y, numSimulations,
        meanReversion, volatility, longTermMean
    );
    
    // Display results
    displayResults(simulationResults, loanAmount, projectionYears);
}

// Update URL parameters without refreshing the page
function updateUrlParams(params) {
    const url = new URL(window.location);
    
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    
    window.history.replaceState({}, '', url);
}



// Swiss Mortgage Calculator
// Core calculation and simulation logic - Part 2: Simulation Engine

// Main simulation function
function runMortgageSimulation(
    loanAmount, projectionYears, currentSaronRate, saronMargin,
    fixedRate2y, fixedRate5y, fixedRate10y, numSimulations,
    meanReversion, volatility, longTermMean
) {
    const monthsToSimulate = projectionYears * 12;
    
    // Generate interest rate scenarios
    const saronScenarios = generateSaronScenarios(
        currentSaronRate, monthsToSimulate, numSimulations,
        meanReversion, volatility, longTermMean
    );
    
    // Strategies to compare
    const strategies = {
        'SARON Variable': { type: 'variable', margin: saronMargin },
        '2-Year Fixed': { type: 'fixed', duration: 24, rate: fixedRate2y },
        '5-Year Fixed': { type: 'fixed', duration: 60, rate: fixedRate5y },
        '10-Year Fixed': { type: 'fixed', duration: 120, rate: fixedRate10y }
    };
    
    // Calculate costs for each strategy across all scenarios
    const results = {};
    
    for (const [strategyName, strategyDetails] of Object.entries(strategies)) {
        results[strategyName] = calculateStrategyCosts(
            strategyName, strategyDetails, saronScenarios, 
            saronMargin, loanAmount, monthsToSimulate
        );
    }
    
    // Calculate probabilities and comparisons
    const comparisons = calculateComparisons(results);
    
    // Sample rate paths for display
    const sampleRatePaths = saronScenarios.slice(0, 10).map(path => 
        path.map(rate => rate * 100) // Convert to percentage
    );
    
    // Return all results
    return {
        strategies: results,
        comparisons: comparisons,
        sampleRatePaths: sampleRatePaths,
        medianRatePath: calculateMedianPath(saronScenarios).map(rate => rate * 100),
        projectionYears: projectionYears
    };
}

// Calculate median path from all scenarios
function calculateMedianPath(scenarios) {
    const numMonths = scenarios[0].length;
    const medianPath = [];
    
    for (let month = 0; month < numMonths; month++) {
        const values = scenarios.map(scenario => scenario[month]);
        values.sort((a, b) => a - b);
        const midPoint = Math.floor(values.length / 2);
        
        if (values.length % 2 === 0) {
            medianPath.push((values[midPoint - 1] + values[midPoint]) / 2);
        } else {
            medianPath.push(values[midPoint]);
        }
    }
    
    return medianPath;
}

// Generate SARON rate scenarios using mean-reverting stochastic process
function generateSaronScenarios(
    currentRate, numMonths, numScenarios,
    meanReversion, volatility, longTermMean
) {
    const scenarios = [];
    const monthlyVolatility = volatility / Math.sqrt(12);
    
    for (let i = 0; i < numScenarios; i++) {
        const path = [currentRate];
        
        for (let month = 1; month < numMonths; month++) {
            // Mean reverting process (Ornstein-Uhlenbeck)
            const drift = meanReversion * (longTermMean - path[month - 1]);
            const randomShock = monthlyVolatility * generateNormalRandom();
            const newRate = path[month - 1] + drift + randomShock;
            
            // Floor at slightly negative (-1%)
            path.push(Math.max(newRate, -0.01));
        }
        
        scenarios.push(path);
    }
    
    return scenarios;
}

// Standard normal random number generator (Box-Muller transform)
function generateNormalRandom() {
    const u1 = Math.random();
    const u2 = Math.random();
    
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z;
}


// Swiss Mortgage Calculator
// Core calculation and simulation logic - Part 3: Strategy Cost Calculations

// Calculate costs for a specific strategy across all scenarios
function calculateStrategyCosts(
    strategyName, strategyDetails, scenarios, 
    saronMargin, loanAmount, totalMonths
) {
    const costs = [];
    const monthlyPayments = [];
    const accumulatedInterest = [];
    
    for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex++) {
        const scenario = scenarios[scenarioIndex];
        
        // Initialize tracking variables
        let totalInterestPaid = 0;
        let payments = [];
        
        // For fixed rate strategies with renewals
        if (strategyDetails.type === 'fixed') {
            let currentMonth = 0;
            
            while (currentMonth < totalMonths) {
                // Determine duration of this fixed period
                const remainingMonths = totalMonths - currentMonth;
                const fixedPeriod = Math.min(strategyDetails.duration, remainingMonths);
                
                // Use initial fixed rate for first period, then use projected SARON + margin for renewals
                let rate;
                if (currentMonth === 0) {
                    rate = strategyDetails.rate;
                } else {
                    // Use projected SARON rate at renewal time plus typical margin for fixed rates
                    const baseRate = scenario[currentMonth];
                    
                    // Different margin based on duration (longer = higher margin)
                    let durationMargin;
                    if (strategyDetails.duration <= 24) {
                        durationMargin = 0.006; // ~0.6% for 2-year
                    } else if (strategyDetails.duration <= 60) {
                        durationMargin = 0.008; // ~0.8% for 5-year
                    } else {
                        durationMargin = 0.012; // ~1.2% for 10-year
                    }
                    
                    rate = baseRate + durationMargin;
                    rate = Math.max(rate, 0.005); // Minimum fixed rate of 0.5%
                }
                
                // Calculate interest for this fixed period
                for (let i = 0; i < fixedPeriod; i++) {
                    const month = currentMonth + i;
                    const monthlyInterest = (loanAmount * rate) / 12;
                    totalInterestPaid += monthlyInterest;
                    payments.push(monthlyInterest);
                }
                
                currentMonth += fixedPeriod;
            }
        } 
        // For variable rate (SARON)
        else if (strategyDetails.type === 'variable') {
            for (let month = 0; month < totalMonths; month++) {
                const rate = Math.max(scenario[month] + strategyDetails.margin, 0.001);
                const monthlyInterest = (loanAmount * rate) / 12;
                totalInterestPaid += monthlyInterest;
                payments.push(monthlyInterest);
            }
        }
        
        costs.push(totalInterestPaid);
        monthlyPayments.push(payments);
        
        // Calculate accumulated interest over time
        const accumulated = [];
        let sum = 0;
        for (const payment of payments) {
            sum += payment;
            accumulated.push(sum);
        }
        accumulatedInterest.push(accumulated);
    }
    
    // Calculate statistics
    costs.sort((a, b) => a - b);
    const meanCost = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
    const medianCost = costs[Math.floor(costs.length / 2)];
    
    // Calculate percentiles
    const percentile10 = costs[Math.floor(costs.length * 0.1)];
    const percentile25 = costs[Math.floor(costs.length * 0.25)];
    const percentile75 = costs[Math.floor(costs.length * 0.75)];
    const percentile90 = costs[Math.floor(costs.length * 0.9)];
    
    // Calculate representative monthly path (median scenario)
    const medianScenarioIndex = findMedianScenarioIndex(costs);
    const representativePayments = monthlyPayments[medianScenarioIndex];
    const representativeAccumulated = accumulatedInterest[medianScenarioIndex];
    
    return {
        name: strategyName,
        details: strategyDetails,
        costs: costs,
        meanCost: meanCost,
        medianCost: medianCost,
        percentile10: percentile10,
        percentile25: percentile25,
        percentile75: percentile75,
        percentile90: percentile90,
        monthlyPayments: representativePayments,
        accumulatedInterest: representativeAccumulated
    };
}

// Find the index of the scenario with cost closest to the median
function findMedianScenarioIndex(costs) {
    const sortedCosts = [...costs].sort((a, b) => a - b);
    const medianCost = sortedCosts[Math.floor(sortedCosts.length / 2)];
    
    // Find the scenario closest to median
    let closestIndex = 0;
    let smallestDifference = Math.abs(costs[0] - medianCost);
    
    for (let i = 1; i < costs.length; i++) {
        const difference = Math.abs(costs[i] - medianCost);
        if (difference < smallestDifference) {
            smallestDifference = difference;
            closestIndex = i;
        }
    }
    
    return closestIndex;
}

// Calculate strategy comparisons and probabilities
function calculateComparisons(results) {
    const strategyNames = Object.keys(results);
    const comparisons = {};
    
    // For each pair of strategies
    for (let i = 0; i < strategyNames.length; i++) {
        const strategy1 = strategyNames[i];
        comparisons[strategy1] = {};
        
        for (let j = 0; j < strategyNames.length; j++) {
            if (i === j) continue;
            
            const strategy2 = strategyNames[j];
            const costs1 = results[strategy1].costs;
            const costs2 = results[strategy2].costs;
            
            let wins = 0;
            for (let k = 0; k < costs1.length; k++) {
                if (costs1[k] < costs2[k]) {
                    wins++;
                }
            }
            
            const winProbability = wins / costs1.length;
            const expectedSavings = results[strategy2].medianCost - results[strategy1].medianCost;
            
            comparisons[strategy1][strategy2] = {
                winProbability: winProbability,
                expectedSavings: expectedSavings
            };
        }
    }
    
    return comparisons;
}


// Swiss Mortgage Calculator
// Core calculation and simulation logic - Part 4a: Summary Display

// Display results in the UI
function displayResults(results, loanAmount, projectionYears) {
    displaySummary(results, loanAmount);
    displayDetailedComparison(results, loanAmount);
    displayCharts(results);
    displayRateProjections(results);
}

// Format number with thousands separator
function formatNumber(num) {
    return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

// Display summary results
function displaySummary(results, loanAmount) {
    const summaryDiv = document.getElementById('summary-results');
    const recommendationDiv = document.getElementById('recommendation');
    
    // Find the best strategy (lowest median cost)
    const strategies = Object.values(results.strategies);
    strategies.sort((a, b) => a.medianCost - b.medianCost);
    const bestStrategy = strategies[0];
    
    // Calculate summary statistics
    const totalInterestDifference = {};
    for (let i = 1; i < strategies.length; i++) {
        const savings = strategies[i].medianCost - bestStrategy.medianCost;
        totalInterestDifference[strategies[i].name] = savings;
    }
    
    // Create summary table
    let summaryHtml = `
        <p>Based on ${results.projectionYears} years of projections with current market conditions:</p>
        <table>
            <thead>
                <tr>
                    <th>Strategy</th>
                    <th>Median Interest Cost</th>
                    <th>vs. Best Strategy</th>
                    <th>Win Probability</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    for (const strategy of strategies) {
        const isWinner = strategy === bestStrategy;
        const vsWinner = isWinner ? '-' : `+CHF ${formatNumber(totalInterestDifference[strategy.name])}`;
        
        // Calculate overall win probability
        let overallWinProbability = '-';
        if (!isWinner) {
            overallWinProbability = `${(results.comparisons[bestStrategy.name][strategy.name].winProbability * 100).toFixed(1)}%`;
        }
        
        summaryHtml += `
            <tr class="${isWinner ? 'strategy-winner' : ''}">
                <td>${strategy.name}</td>
                <td>CHF ${formatNumber(strategy.medianCost)}</td>
                <td>${vsWinner}</td>
                <td>${isWinner ? '100%' : overallWinProbability}</td>
            </tr>
        `;
    }
    
    summaryHtml += `
            </tbody>
        </table>
        <p><strong>Note:</strong> "Win Probability" shows how often the best strategy outperforms others in our simulations.</p>
    `;
    
    // Create recommendation
    let recommendationHtml = `
        <p>Based on our analysis, the <strong>${bestStrategy.name}</strong> strategy has the highest probability of being the most cost-effective option over ${results.projectionYears} years.</p>
    `;
    
    // Add specific details based on strategy type
    if (bestStrategy.name === 'SARON Variable') {
        recommendationHtml += `
            <p>The variable rate strategy is projected to save you <strong>CHF ${formatNumber(totalInterestDifference['10-Year Fixed'])}</strong> compared to a 10-year fixed rate over the full period.</p>
            <p>This recommendation is based on the current market expectation that SARON rates will remain relatively low, giving variable rates an advantage.</p>
        `;
    } else {
        const fixedPeriod = bestStrategy.details.duration / 12;
        recommendationHtml += `
            <p>Locking in a ${fixedPeriod}-year fixed rate is projected to provide the best balance of cost and certainty.</p>
            <p>While variable rates might occasionally be lower, the fixed rate protects against potential rate increases during this period.</p>
        `;
    }
    
    // Add risk assessment
    const riskAssessment = assessRisk(results);
    recommendationHtml += `
        <p><strong>Risk assessment:</strong> ${riskAssessment}</p>
    `;
    
    summaryDiv.innerHTML = summaryHtml;
    recommendationDiv.innerHTML = recommendationHtml;
}

// Assess risk based on simulation results
function assessRisk(results) {
    const strategies = Object.values(results.strategies);
    const variableStrategy = strategies.find(s => s.name === 'SARON Variable');
    const fixed10YStrategy = strategies.find(s => s.name === '10-Year Fixed');
    
    if (!variableStrategy || !fixed10YStrategy) {
        return "Unable to assess risk with the current strategies.";
    }
    
    const variableRisk = (variableStrategy.percentile90 - variableStrategy.percentile10) / variableStrategy.medianCost;
    const fixed10YRisk = (fixed10YStrategy.percentile90 - fixed10YStrategy.percentile10) / fixed10YStrategy.medianCost;
    
    if (variableRisk > 0.5) {
        return "The variable rate strategy has high uncertainty. If you prefer stability and predictability in your payments, consider a fixed rate despite the potentially higher cost.";
    } else if (variableRisk > 0.3) {
        return "The variable rate strategy has moderate uncertainty. Consider your risk tolerance when deciding between variable and fixed rates.";
    } else {
        return "Current projections show relatively low uncertainty in interest rate movements. The variable rate strategy presents a reasonable risk profile.";
    }
}

// Display detailed comparison
function displayDetailedComparison(results, loanAmount) {
    const detailedDiv = document.getElementById('detailed-comparison');
    const strategies = Object.values(results.strategies);
    
    let detailedHtml = `
        <table>
            <thead>
                <tr>
                    <th>Strategy</th>
                    <th>Median Cost</th>
                    <th>Mean Cost</th>
                    <th>10th Percentile</th>
                    <th>90th Percentile</th>
                    <th>Risk Range</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    for (const strategy of strategies) {
        const riskRange = ((strategy.percentile90 - strategy.percentile10) / strategy.medianCost * 100).toFixed(1);
        
        detailedHtml += `
            <tr>
                <td>${strategy.name}</td>
                <td>CHF ${formatNumber(strategy.medianCost)}</td>
                <td>CHF ${formatNumber(strategy.meanCost)}</td>
                <td>CHF ${formatNumber(strategy.percentile10)}</td>
                <td>CHF ${formatNumber(strategy.percentile90)}</td>
                <td>${riskRange}%</td>
            </tr>
        `;
    }
    
    detailedHtml += `
            </tbody>
        </table>
        
        <h3>Pairwise Comparisons</h3>
        <p>The table below shows the probability of each strategy outperforming others:</p>
        
        <table>
            <thead>
                <tr>
                    <th>Strategy</th>
    `;
    
    for (const strategy of strategies) {
        detailedHtml += `<th>vs. ${strategy.name}</th>`;
    }
    
    detailedHtml += `
                </tr>
            </thead>
            <tbody>
    `;
    
    for (const strategy1 of strategies) {
        detailedHtml += `<tr><td>${strategy1.name}</td>`;
        
        for (const strategy2 of strategies) {
            if (strategy1.name === strategy2.name) {
                detailedHtml += `<td>-</td>`;
            } else {
                const comparison = results.comparisons[strategy1.name][strategy2.name];
                const probability = (comparison.winProbability * 100).toFixed(1);
                const savings = comparison.expectedSavings;
                
                detailedHtml += `
                    <td>${probability}%<br><small>(CHF ${formatNumber(Math.abs(savings))} ${savings > 0 ? 'saved' : 'extra'})</small></td>
                `;
            }
        }
        
        detailedHtml += `</tr>`;
    }
    
    detailedHtml += `
            </tbody>
        </table>
    `;
    
    detailedDiv.innerHTML = detailedHtml;
}


// Swiss Mortgage Calculator
// Core calculation and simulation logic - Part 4b: Charts

// Format number with thousands separator
function formatNumber(num) {
    return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

// Display simulation charts
function displayCharts(results) {
    displayCostDistributionChart(results);
    displayCumulativeCostChart(results);
}

// Display cost distribution chart
// Update the displayCostDistributionChart function in your calculator.js file
function displayCostDistributionChart(results) {
    const chartCanvas = document.getElementById('cost-distribution-chart');
    
    if (!chartCanvas) return;
    
    // Prepare data
    const strategies = Object.values(results.strategies);
    const datasets = [];
    const strategiesColors = {
        'SARON Variable': 'rgba(54, 162, 235, 0.8)',
        '2-Year Fixed': 'rgba(255, 99, 132, 0.8)',
        '5-Year Fixed': 'rgba(75, 192, 192, 0.8)',
        '10-Year Fixed': 'rgba(255, 159, 64, 0.8)'
    };
    
    // Improved histogram generation
    // First find the global min and max to use consistent bins across strategies
    let globalMin = Infinity;
    let globalMax = -Infinity;
    
    for (const strategy of strategies) {
        const min = Math.min(...strategy.costs);
        const max = Math.max(...strategy.costs);
        
        if (min < globalMin) globalMin = min;
        if (max > globalMax) globalMax = max;
    }
    
    // Add some padding to the range
    globalMin = Math.floor(globalMin * 0.95);
    globalMax = Math.ceil(globalMax * 1.05);
    
    // Use fewer bins for clearer visualization
    const numBins = 15;
    const binWidth = (globalMax - globalMin) / numBins;
    
    for (const strategy of strategies) {
        // Create histogram data with consistent bins
        const histogramData = [];
        const bins = Array(numBins).fill(0);
        
        for (const cost of strategy.costs) {
            const binIndex = Math.min(Math.floor((cost - globalMin) / binWidth), numBins - 1);
            if (binIndex >= 0) bins[binIndex]++;
        }
        
        for (let i = 0; i < numBins; i++) {
            const binStart = globalMin + i * binWidth;
            
            histogramData.push({
                x: binStart,
                y: bins[i],
                w: binWidth
            });
        }
        
        datasets.push({
            label: strategy.name,
            data: histogramData,
            backgroundColor: strategiesColors[strategy.name] || 'rgba(0, 0, 0, 0.8)',
            borderWidth: 1,
            barPercentage: 0.95,  // Make bars slightly more visible
            categoryPercentage: 0.95
        });
    }
    
    // Create chart
    if (window.costDistributionChart) {
        window.costDistributionChart.destroy();
    }
    
    window.costDistributionChart = new Chart(chartCanvas, {
        type: 'bar',
        data: {
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Distribution of Total Interest Costs',
                    font: {
                        size: 16
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const start = context.parsed.x;
                            const end = start + context.parsed.w;
                            return `${context.dataset.label}: CHF ${formatNumber(start)} to ${formatNumber(end)} (${context.parsed.y} scenarios)`;
                        }
                    }
                },
                legend: {
                    position: 'top'
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Total Interest Cost (CHF)'
                    },
                    ticks: {
                        callback: function(value) {
                            return formatNumber(value);
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Frequency'
                    }
                }
            }
        }
    });
}

// Generate histogram data for Chart.js
function generateHistogramData(data, numBins) {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binWidth = (max - min) / numBins;
    
    const bins = Array(numBins).fill(0);
    
    for (const value of data) {
        const binIndex = Math.min(Math.floor((value - min) / binWidth), numBins - 1);
        bins[binIndex]++;
    }
    
    const result = [];
    for (let i = 0; i < numBins; i++) {
        result.push({
            x: min + i * binWidth,
            y: bins[i],
            w: binWidth
        });
    }
    
    return result;
}

// Display cumulative cost chart
function displayCumulativeCostChart(results) {
    const chartCanvas = document.getElementById('cumulative-cost-chart');
    
    if (!chartCanvas) return;
    
    // Prepare data
    const strategies = Object.values(results.strategies);
    const labels = Array.from({length: strategies[0].accumulatedInterest.length}, (_, i) => i + 1);
    const datasets = [];
    
    const strategiesColors = {
        'SARON Variable': 'rgba(54, 162, 235, 1)',
        '2-Year Fixed': 'rgba(255, 99, 132, 1)',
        '5-Year Fixed': 'rgba(75, 192, 192, 1)',
        '10-Year Fixed': 'rgba(255, 159, 64, 1)'
    };
    
    for (const strategy of strategies) {
        datasets.push({
            label: strategy.name,
            data: strategy.accumulatedInterest,
            borderColor: strategiesColors[strategy.name] || 'rgba(0, 0, 0, 1)',
            fill: false
        });
    }
    
    // Create chart
    if (window.cumulativeCostChart) {
        window.cumulativeCostChart.destroy();
    }
    
    window.cumulativeCostChart = new Chart(chartCanvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Cumulative Interest Costs Over Time (Median Scenario)'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: CHF ${formatNumber(context.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Month'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Cumulative Interest (CHF)'
                    }
                }
            }
        }
    });
}

// Display rate projections
function displayRateProjections(results) {
    const chartCanvas = document.getElementById('rates-chart');
    
    if (!chartCanvas) return;
    
    // Prepare data
    const samplePaths = results.sampleRatePaths;
    const medianPath = results.medianRatePath;
    const labels = Array.from({length: medianPath.length}, (_, i) => i + 1);
    
    const datasets = [
        {
            label: 'Median SARON Projection',
            data: medianPath,
            borderColor: 'rgba(0, 0, 0, 1)',
            borderWidth: 3,
            fill: false
        }
    ];
    
    // Add sample paths with lower opacity
    for (let i = 0; i < samplePaths.length; i++) {
        datasets.push({
            label: `Scenario ${i + 1}`,
            data: samplePaths[i],
            borderColor: 'rgba(54, 162, 235, 0.3)',
            borderWidth: 1,
            fill: false,
            pointRadius: 0,
            hidden: i > 2 // Only show a few sample paths by default
        });
    }
    
    // Create chart
    if (window.ratesChart) {
        window.ratesChart.destroy();
    }
    
    window.ratesChart = new Chart(chartCanvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'SARON Rate Projections'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Month'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'SARON Rate (%)'
                    }
                }
            }
        }
    });
}


