// Global variables to store data
let teams = [];
let fixtures = [];
let results = [];

// Load data when page loads
document.addEventListener('DOMContentLoaded', async function() {
    await loadData();
    showTab('standings');
});

// Load JSON data
async function loadData() {
    try {
        const [teamsResponse, fixturesResponse, resultsResponse] = await Promise.all([
            fetch('data/teams.json'),
            fetch('data/fixtures.json'),
            fetch('data/results.json')
        ]);
        
        teams = await teamsResponse.json();
        fixtures = await fixturesResponse.json();
        results = await resultsResponse.json();
        
        console.log('Data loaded successfully');
        updateAllTabs();
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Tab switching functionality
function showTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(tab => tab.classList.remove('active'));
    
    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => button.classList.remove('active'));
    
    // Show selected tab content
    document.getElementById(tabName).classList.add('active');
    
    // Add active class to clicked button
    const activeButton = document.querySelector(`[onclick="showTab('${tabName}')"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }
    
    // Update content based on tab
    switch(tabName) {
        case 'standings':
            updateStandings();
            break;
        case 'calendar':
            updateCalendar();
            break;
        case 'results':
            updateResults();
            break;
        case 'simulator':
            updateSimulation();
            break;
    }
}

// Calculate standings with tie-breaker rules
function calculateStandings() {
    const standings = [];
    
    // Initialize standings for each team
    teams.forEach(team => {
        standings.push({
            id: team.id,
            name: team.name,
            fullName: team.fullName,
            played: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            points: 0,
            matchHistory: [],
            headToHeadWins: {} // Store wins against each opponent
        });
    });
    
    // Process results
    results.forEach(result => {
        if (result.played) {
            const homeTeam = standings.find(team => team.id === result.homeTeam);
            const awayTeam = standings.find(team => team.id === result.awayTeam);
            
            if (homeTeam && awayTeam) {
                // Initialize head-to-head records if not exists
                if (!homeTeam.headToHeadWins[awayTeam.id]) homeTeam.headToHeadWins[awayTeam.id] = 0;
                if (!awayTeam.headToHeadWins[homeTeam.id]) awayTeam.headToHeadWins[homeTeam.id] = 0;
                
                // Update match counts
                homeTeam.played++;
                awayTeam.played++;
                
                // Update goals
                homeTeam.goalsFor += result.homeScore;
                homeTeam.goalsAgainst += result.awayScore;
                awayTeam.goalsFor += result.awayScore;
                awayTeam.goalsAgainst += result.homeScore;
                
                // Determine result and update wins/losses/draws
                if (result.homeScore > result.awayScore) {
                    // Home team wins
                    homeTeam.wins++;
                    homeTeam.points += 3;
                    homeTeam.matchHistory.push('W');
                    homeTeam.headToHeadWins[awayTeam.id]++;
                    awayTeam.losses++;
                    awayTeam.matchHistory.push('L');
                } else if (result.homeScore < result.awayScore) {
                    // Away team wins
                    awayTeam.wins++;
                    awayTeam.points += 3;
                    awayTeam.matchHistory.push('W');
                    awayTeam.headToHeadWins[homeTeam.id]++;
                    homeTeam.losses++;
                    homeTeam.matchHistory.push('L');
                } else {
                    // Draw
                    homeTeam.draws++;
                    homeTeam.points += 1;
                    homeTeam.matchHistory.push('D');
                    awayTeam.draws++;
                    awayTeam.points += 1;
                    awayTeam.matchHistory.push('D');
                }
                
                // Calculate goal difference
                homeTeam.goalDifference = homeTeam.goalsFor - homeTeam.goalsAgainst;
                awayTeam.goalDifference = awayTeam.goalsFor - awayTeam.goalsAgainst;
            }
        }
    });
    
    // Sort standings with tie-breaker rules
    standings.sort((a, b) => {
        // 1st: Points
        if (a.points !== b.points) {
            return b.points - a.points;
        }
        
        // 2nd: Goal difference (goals scored - goals conceded)
        if (a.goalDifference !== b.goalDifference) {
            return b.goalDifference - a.goalDifference;
        }
        
        // 3rd: Total goals scored
        if (a.goalsFor !== b.goalsFor) {
            return b.goalsFor - a.goalsFor;
        }
        
        // 4th: Head-to-head wins (TB - highest number of points obtained by tied teams against each other)
        const aHeadToHeadWins = Object.values(a.headToHeadWins).reduce((sum, wins) => sum + wins, 0);
        const bHeadToHeadWins = Object.values(b.headToHeadWins).reduce((sum, wins) => sum + wins, 0);
        
        if (aHeadToHeadWins !== bHeadToHeadWins) {
            return bHeadToHeadWins - aHeadToHeadWins;
        }
        
        // Final tie-breaker: alphabetical order
        return a.name.localeCompare(b.name);
    });
    
    return standings;
}

// Update standings table
function updateStandings() {
    const standings = calculateStandings();
    const tbody = document.getElementById('standings-body');
    tbody.innerHTML = '';
    
    standings.forEach((team, index) => {
        const row = document.createElement('tr');
        
        // Calculate total head-to-head wins for TB column
        const headToHeadWins = Object.values(team.headToHeadWins).reduce((sum, wins) => sum + wins, 0);
        
        // Rank
        const rankClass = index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : '';
        row.innerHTML = `
            <td class="rank ${rankClass}">${index + 1}</td>
            <td class="team-name">${team.name}</td>
            <td class="stats">${team.played}</td>
            <td class="stats">${team.wins}-${team.losses}-${team.draws}</td>
            <td class="stats points">${team.points}</td>
            <td class="stats">${team.goalDifference > 0 ? '+' : ''}${team.goalDifference}</td>
            <td class="stats">${team.goalsFor}</td>
            <td class="stats">${headToHeadWins}</td>
            <td class="match-history">${generateMatchHistoryHTML(team.matchHistory)}</td>
        `;
        
        tbody.appendChild(row);
    });
}

// Generate match history HTML
function generateMatchHistoryHTML(history) {
    return history.map(result => {
        let className = '';
        switch(result) {
            case 'W': className = 'win'; break;
            case 'L': className = 'loss'; break;
            case 'D': className = 'draw'; break;
        }
        return `<span class="match-card ${className}">${result}</span>`;
    }).join('');
}

// Update calendar
function updateCalendar() {
    const calendarContent = document.getElementById('calendar-content');
    calendarContent.innerHTML = '';
    
    fixtures.forEach(gameweek => {
        const gameweekDiv = document.createElement('div');
        gameweekDiv.className = 'gameweek-section';
        
        const headerDiv = document.createElement('div');
        headerDiv.className = 'gameweek-header';
        headerDiv.textContent = `Gameweek ${gameweek.gameweek}`;
        
        const matchesDiv = document.createElement('div');
        matchesDiv.className = 'gameweek-matches';
        
        gameweek.matches.forEach(match => {
            const homeTeam = teams.find(t => t.id === match.homeTeam);
            const awayTeam = teams.find(t => t.id === match.awayTeam);
            
            const matchDiv = document.createElement('div');
            matchDiv.className = 'match-item';
            
            const date = new Date(match.date);
            const formattedDate = date.toLocaleDateString('en-US', { 
                weekday: 'short', 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
            
            matchDiv.innerHTML = `
                <div class="match-teams">
                    ${homeTeam.name} <span class="match-vs">vs</span> ${awayTeam.name}
                </div>
                <div class="match-datetime">
                    ${formattedDate} - ${match.time}
                </div>
            `;
            
            matchesDiv.appendChild(matchDiv);
        });
        
        gameweekDiv.appendChild(headerDiv);
        gameweekDiv.appendChild(matchesDiv);
        calendarContent.appendChild(gameweekDiv);
    });
}

// Update results
function updateResults() {
    const resultsContent = document.getElementById('results-content');
    resultsContent.innerHTML = '';
    
    // Group results by gameweek
    const resultsByGameweek = {};
    results.forEach(result => {
        if (result.played) {
            if (!resultsByGameweek[result.gameweek]) {
                resultsByGameweek[result.gameweek] = [];
            }
            resultsByGameweek[result.gameweek].push(result);
        }
    });
    
    // Display results by gameweek
    Object.keys(resultsByGameweek).sort((a, b) => a - b).forEach(gameweek => {
        const gameweekDiv = document.createElement('div');
        gameweekDiv.className = 'gameweek-section';
        
        const headerDiv = document.createElement('div');
        headerDiv.className = 'gameweek-header';
        headerDiv.textContent = `Gameweek ${gameweek} Results`;
        
        const matchesDiv = document.createElement('div');
        matchesDiv.className = 'gameweek-matches';
        
        resultsByGameweek[gameweek].forEach(result => {
            const homeTeam = teams.find(t => t.id === result.homeTeam);
            const awayTeam = teams.find(t => t.id === result.awayTeam);
            
            const matchDiv = document.createElement('div');
            matchDiv.className = 'match-item';
            
            matchDiv.innerHTML = `
                <div class="match-teams">
                    ${homeTeam.name} <span class="match-vs">vs</span> ${awayTeam.name}
                </div>
                <div class="match-score">
                    ${result.homeScore} - ${result.awayScore}
                </div>
            `;
            
            matchesDiv.appendChild(matchDiv);
        });
        
        gameweekDiv.appendChild(headerDiv);
        gameweekDiv.appendChild(matchesDiv);
        resultsContent.appendChild(gameweekDiv);
    });
}

// Update all tabs
function updateAllTabs() {
    updateStandings();
    updateCalendar();
    updateResults();
}

// Utility function to get team by ID
function getTeamById(id) {
    return teams.find(team => team.id === id);
}

// Function to add new result (for future simulator functionality)
function addResult(homeTeamId, awayTeamId, homeScore, awayScore, gameweek) {
    const newResult = {
        matchId: `match-${Date.now()}`,
        homeTeam: homeTeamId,
        awayTeam: awayTeamId,
        homeScore: homeScore,
        awayScore: awayScore,
        gameweek: gameweek,
        played: true
    };
    
    results.push(newResult);
    updateAllTabs();
}

// Function to update result (for future simulator functionality)
function updateResult(matchId, homeScore, awayScore) {
    const result = results.find(r => r.matchId === matchId);
    if (result) {
        result.homeScore = homeScore;
        result.awayScore = awayScore;
        result.played = true;
        updateAllTabs();
    }
}

// Simulator functionality
function updateSimulation() {
    const selectedTeamId = document.getElementById('selected-team').value;
    const selectedTeam = teams.find(t => t.id === selectedTeamId);
    
    if (!selectedTeam) return;
    
    const simulationResults = document.getElementById('simulation-results');
    simulationResults.innerHTML = generateSimulationHTML(selectedTeamId, selectedTeam);
}

function generateSimulationHTML(teamId, team) {
    const currentStandings = calculateStandings();
    const teamStanding = currentStandings.find(t => t.id === teamId);
    const currentPosition = currentStandings.findIndex(t => t.id === teamId) + 1;
    const remainingMatches = getRemainingMatches(teamId);
    const scenarios = calculateChampionshipScenarios(teamId, currentStandings);
    
    return `
        <div class="simulation-section">
            <div class="simulation-header">
                Current Position: ${team.name}
            </div>
            <div class="simulation-content">
                <div class="current-position">
                    <h4>Current Standing: ${currentPosition}${getOrdinalSuffix(currentPosition)} Place</h4>
                    <div class="position-stats">
                        <div class="stat-item">
                            <div class="stat-value">${teamStanding.points}</div>
                            <div class="stat-label">Points</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${teamStanding.goalDifference > 0 ? '+' : ''}${teamStanding.goalDifference}</div>
                            <div class="stat-label">Goal Diff</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${teamStanding.goalsFor}</div>
                            <div class="stat-label">Total Goals</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">${teamStanding.played}</div>
                            <div class="stat-label">Matches</div>
                        </div>
                    </div>
                </div>
                
                ${remainingMatches.length > 0 ? `
                <div class="remaining-matches">
                    <h4>Remaining Matches (${remainingMatches.length})</h4>
                    <div class="match-list">
                        ${remainingMatches.map(match => generateRemainingMatchHTML(match)).join('')}
                    </div>
                </div>
                ` : '<div class="remaining-matches"><h4>All matches completed for this team</h4></div>'}
            </div>
        </div>
        
        <div class="simulation-section">
            <div class="simulation-header">
                Championship Scenarios for ${team.name}
            </div>
            <div class="simulation-content">
                ${scenarios.length > 0 ? `
                    <ul class="scenarios-list">
                        ${scenarios.map(scenario => generateScenarioHTML(scenario)).join('')}
                    </ul>
                ` : '<p>No viable championship scenarios available with current standings and remaining matches.</p>'}
            </div>
        </div>
    `;
}

function getRemainingMatches(teamId) {
    const remaining = [];
    
    fixtures.forEach(gameweek => {
        gameweek.matches.forEach(match => {
            const isTeamInMatch = match.homeTeam === teamId || match.awayTeam === teamId;
            const hasResult = results.find(r => r.matchId === match.id && r.played);
            
            if (isTeamInMatch && !hasResult) {
                const homeTeam = teams.find(t => t.id === match.homeTeam);
                const awayTeam = teams.find(t => t.id === match.awayTeam);
                
                remaining.push({
                    ...match,
                    gameweek: gameweek.gameweek,
                    homeTeamName: homeTeam.name,
                    awayTeamName: awayTeam.name
                });
            }
        });
    });
    
    return remaining.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function generateRemainingMatchHTML(match) {
    const date = new Date(match.date);
    const formattedDate = date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
    });
    
    return `
        <div class="remaining-match">
            <div class="match-teams-sim">${match.homeTeamName} vs ${match.awayTeamName}</div>
            <div class="match-date-sim">${formattedDate} - ${match.time}</div>
        </div>
    `;
}

function calculateChampionshipScenarios(teamId, standings) {
    const teamStanding = standings.find(t => t.id === teamId);
    const currentPosition = standings.findIndex(t => t.id === teamId) + 1;
    const scenarios = [];
    
    if (currentPosition === 1) {
        scenarios.push({
            type: 'current-leader',
            title: 'Currently in 1st Place!',
            description: 'You are currently leading the championship. Maintain your position by not losing significant ground to competitors.',
            probability: 'high',
            requirements: []
        });
    }
    
    // Get teams ahead of current team
    const teamsAhead = standings.slice(0, currentPosition - 1);
    const remainingMatches = getRemainingMatches(teamId);
    const maxPossiblePoints = teamStanding.points + (remainingMatches.length * 3);
    
    // Scenario 1: Win all remaining matches
    if (remainingMatches.length > 0) {
        const pointsIfWinAll = teamStanding.points + (remainingMatches.length * 3);
        let canWinByWinningAll = true;
        let competitorRequirements = [];
        
        teamsAhead.forEach(competitor => {
            const competitorRemaining = getRemainingMatches(competitor.id);
            const competitorMaxPoints = competitor.points + (competitorRemaining.length * 3);
            
            if (competitorMaxPoints >= pointsIfWinAll) {
                canWinByWinningAll = false;
                const requiredLosses = Math.ceil((competitorMaxPoints - pointsIfWinAll + 1) / 3);
                competitorRequirements.push({
                    team: competitor.name,
                    maxPoints: competitorMaxPoints,
                    requiredLosses: Math.min(requiredLosses, competitorRemaining.length)
                });
            }
        });
        
        if (canWinByWinningAll) {
            scenarios.push({
                type: 'win-all',
                title: 'Win All Remaining Matches',
                description: `Win all ${remainingMatches.length} remaining matches to secure ${pointsIfWinAll} points and guarantee championship.`,
                probability: remainingMatches.length <= 2 ? 'high' : remainingMatches.length <= 4 ? 'medium' : 'low',
                requirements: [`Win all ${remainingMatches.length} remaining matches`]
            });
        } else {
            scenarios.push({
                type: 'win-all-with-help',
                title: 'Win All + Competitors Must Drop Points',
                description: `Even winning all remaining matches (${pointsIfWinAll} points) requires competitors to lose some matches.`,
                probability: 'low',
                requirements: [
                    `Win all ${remainingMatches.length} remaining matches`,
                    ...competitorRequirements.map(req => 
                        `${req.team} must lose at least ${req.requiredLosses} match${req.requiredLosses > 1 ? 'es' : ''}`
                    )
                ]
            });
        }
    }
    
    // Scenario 2: Realistic scenarios based on current gap
    if (currentPosition <= 3) {
        const leader = standings[0];
        const pointsGap = leader.points - teamStanding.points;
        
        if (pointsGap <= 6 && remainingMatches.length >= 2) {
            scenarios.push({
                type: 'realistic',
                title: 'Realistic Championship Path',
                description: `With a ${pointsGap}-point gap, strong performance in remaining matches while competitors drop points could secure the title.`,
                probability: pointsGap <= 3 ? 'medium' : 'low',
                requirements: [
                    `Win at least ${Math.ceil((pointsGap + 1) / 3)} of remaining matches`,
                    `${leader.name} must drop points in at least ${Math.ceil(pointsGap / 3)} matches`,
                    'Maintain superior goal difference'
                ]
            });
        }
    }
    
    // Scenario 3: Mathematical possibility
    if (maxPossiblePoints > standings[0].points) {
        scenarios.push({
            type: 'mathematical',
            title: 'Mathematically Still Possible',
            description: `Maximum possible points: ${maxPossiblePoints}. Championship remains mathematically possible.`,
            probability: currentPosition <= 3 ? 'medium' : 'low',
            requirements: [
                'Win majority of remaining matches',
                'All teams ahead must lose multiple matches',
                'Achieve superior goal difference through high-scoring wins'
            ]
        });
    }
    
    // If no realistic scenarios
    if (scenarios.length === 0 || maxPossiblePoints <= standings[0].points) {
        scenarios.push({
            type: 'impossible',
            title: 'Championship No Longer Possible',
            description: 'Based on current standings and remaining matches, the championship is no longer achievable.',
            probability: 'none',
            requirements: ['Focus on securing the highest possible final position']
        });
    }
    
    return scenarios.slice(0, 4); // Limit to 4 scenarios
}

function generateScenarioHTML(scenario) {
    const probabilityClass = {
        'high': 'probability-high',
        'medium': 'probability-medium', 
        'low': 'probability-low',
        'none': 'probability-low'
    };
    
    const scenarioClass = {
        'current-leader': '',
        'win-all': '',
        'realistic': 'unlikely',
        'mathematical': 'unlikely',
        'impossible': 'impossible'
    };
    
    return `
        <li class="scenario-item ${scenarioClass[scenario.type] || ''}">
            <div class="scenario-title">${scenario.title}</div>
            <div class="scenario-description">${scenario.description}</div>
            ${scenario.requirements.length > 0 ? `
                <div style="margin-top: 10px;">
                    <strong>Requirements:</strong>
                    <ul style="margin: 5px 0 0 20px;">
                        ${scenario.requirements.map(req => `<li>${req}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            <span class="scenario-probability ${probabilityClass[scenario.probability]}">
                ${scenario.probability === 'none' ? 'Not Possible' : scenario.probability.charAt(0).toUpperCase() + scenario.probability.slice(1) + ' Probability'}
            </span>
        </li>
    `;
}

function getOrdinalSuffix(number) {
    const j = number % 10;
    const k = number % 100;
    if (j == 1 && k != 11) return "st";
    if (j == 2 && k != 12) return "nd";
    if (j == 3 && k != 13) return "rd";
    return "th";
}