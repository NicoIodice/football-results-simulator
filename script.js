// Global variables to store data
let teams = [];
let fixtures = [];
let results = [];

// OpenAI API configuration
const OPENAI_CONFIG = {
    apiKey: null, // API key will be set by user input only
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-3.5-turbo'
};

// Configuration for simulation type
const SIMULATION_CONFIG = {
    useOpenAI: false, // Switch to enable/disable OpenAI analysis
    pointsGapLimit: 3 // Only analyze teams within this points gap
};

// Set OpenAI API key (call this with your key)
function setOpenAIKey(apiKey) {
    if (apiKey && apiKey.trim()) {
        OPENAI_CONFIG.apiKey = apiKey.trim();
        // Store in sessionStorage instead of localStorage for better security
        sessionStorage.setItem('openai_session_key', OPENAI_CONFIG.apiKey);
    }
}

// Load API key from sessionStorage (only for current session)
function loadOpenAIKey() {
    const savedKey = sessionStorage.getItem('openai_session_key');
    if (savedKey && savedKey.trim()) {
        OPENAI_CONFIG.apiKey = savedKey;
    }
}

// Prompt user for API key
function promptForAPIKey() {
    const apiKey = prompt('Enter your OpenAI API key for AI-powered analysis:');
    if (apiKey && apiKey.trim()) {
        setOpenAIKey(apiKey.trim());
        // Refresh the simulation with AI enabled
        updateSimulation();
    }
}

// Load data when page loads
document.addEventListener('DOMContentLoaded', async function() {
    loadOpenAIKey();
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
        case 'fixtures':
            updateFixtures();
            break;
        case 'simulator':
            updateSimulation();
            break;
        case 'forecast':
            updateForecast();
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
    
    // Determine first place teams (all teams with same points as leader)
    const firstPlacePoints = standings[0].points;
    const firstPlaceTeams = standings.filter(team => team.points === firstPlacePoints);
    
    standings.forEach((team, index) => {
        const row = document.createElement('tr');

        // TB3 logic: show '-' by default, only show head-to-head points if two teams are tied on points
        let tb3Value = '-';
        // Find all teams with the same points
        const tiedTeams = standings.filter(t => t.points === team.points);
        if (tiedTeams.length === 2) {
            // Only two teams tied, show head-to-head points for the other team
            const otherTeam = tiedTeams.find(t => t.id !== team.id);
            if (otherTeam) {
                // Find the result of the match between these two teams
                let headToHeadPoints = 0;
                let foundHeadToHeadMatch = false;
                results.forEach(result => {
                    if (
                        ((result.homeTeam === team.id && result.awayTeam === otherTeam.id) ||
                        (result.homeTeam === otherTeam.id && result.awayTeam === team.id)) &&
                        result.played
                    ) {
                        foundHeadToHeadMatch = true;
                        if (result.homeTeam === team.id) {
                            if (result.homeScore > result.awayScore) headToHeadPoints += 3;
                            else if (result.homeScore === result.awayScore) headToHeadPoints += 1;
                            // If homeScore < awayScore, headToHeadPoints remains 0 (loss)
                        } else if (result.awayTeam === team.id) {
                            if (result.awayScore > result.homeScore) headToHeadPoints += 3;
                            else if (result.homeScore === result.awayScore) headToHeadPoints += 1;
                            // If awayScore < homeScore, headToHeadPoints remains 0 (loss)
                        }
                    }
                });
                // Only show TB3 value if a head-to-head match was found between the tied teams
                if (foundHeadToHeadMatch) {
                    tb3Value = headToHeadPoints;
                }
            }
        }

        // Check if this team is in first place (tied for first)
        const isFirstPlace = firstPlaceTeams.includes(team);
        
        // Add first place class to row if team is tied for first
        if (isFirstPlace) {
            row.classList.add('first-place');
        }

        // Rank and goal difference colors
        const rankClass = index === 0 ? 'first' : index === 1 ? 'second' : index === 2 ? 'third' : '';
        const goalDiffClass = team.goalDifference > 0 ? 'goal-diff-positive' : 
                             team.goalDifference < 0 ? 'goal-diff-negative' : 'goal-diff-zero';

        row.innerHTML = `
            <td class="rank ${rankClass}">${index + 1}</td>
            <td class="team-name">${team.name}</td>
            <td class="stats">${team.played}</td>
            <td class="stats">${team.wins}-${team.losses}-${team.draws}</td>
            <td class="stats ${goalDiffClass}">${team.goalDifference > 0 ? '+' : ''}${team.goalDifference}</td>
            <td class="stats">${team.goalsFor}</td>
            <td class="stats">${tb3Value}</td>
            <td class="match-history">${generateMatchHistoryHTML(team.matchHistory)}</td>
            <td class="stats points">${team.points}</td>
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
    updateFixtures();
}

// Update fixtures (merged calendar and results)
function updateFixtures() {
    const fixturesContent = document.getElementById('fixtures-content');
    fixturesContent.innerHTML = '';
    
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
            const result = results.find(r => r.matchId === match.id && r.played);
            
            const matchDiv = document.createElement('div');
            matchDiv.className = 'match-item';
            
            const date = new Date(match.date);
            const formattedDate = date.toLocaleDateString('en-US', { 
                weekday: 'short', 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
            
            const scoreDisplay = result ? 
                `${result.homeScore} - ${result.awayScore}` : 
                ` - `;
            
            // Check if match is today or tomorrow
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            
            const matchDate = new Date(match.date);
            
            // Compare dates by creating date strings in YYYY-MM-DD format
            const todayStr = today.getFullYear() + '-' + 
                           String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                           String(today.getDate()).padStart(2, '0');
            const tomorrowStr = tomorrow.getFullYear() + '-' + 
                              String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + 
                              String(tomorrow.getDate()).padStart(2, '0');
            
            const isToday = match.date === todayStr;
            const isTomorrow = match.date === tomorrowStr;
            
            let matchIndicator = '';
            if (!result) { // Only show indicators for upcoming matches
                if (isToday) {
                    matchIndicator = '<span class="match-indicator today">Today</span>';
                } else if (isTomorrow) {
                    matchIndicator = '<span class="match-indicator tomorrow">Tomorrow</span>';
                }
            }
            
            const scoreClass = result ? 'completed' : 'upcoming';
            
            matchDiv.innerHTML = `
                <div class="match-teams">
                    ${homeTeam.name} <span class="match-vs">vs</span> ${awayTeam.name}
                    ${matchIndicator}
                </div>
                <div class="match-datetime">${formattedDate} - ${match.time}</div>
                <div class="match-score ${scoreClass}">${scoreDisplay}</div>
            `;
            
            matchesDiv.appendChild(matchDiv);
        });
        
        gameweekDiv.appendChild(headerDiv);
        gameweekDiv.appendChild(matchesDiv);
        fixturesContent.appendChild(gameweekDiv);
    });
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

// AI-Powered Simulator functionality
async function updateSimulation() {
    const selectedTeamId = document.getElementById('selected-team').value;
    const selectedTeam = teams.find(t => t.id === selectedTeamId);
    
    if (!selectedTeam) return;
    
    const simulationResults = document.getElementById('simulation-results');
    simulationResults.innerHTML = '<div class="loading">⚽ Analyzing championship scenarios...</div>';
    
    try {
        // Check if OpenAI is enabled, otherwise use custom analysis
        if (SIMULATION_CONFIG.useOpenAI && OPENAI_CONFIG.apiKey && OPENAI_CONFIG.apiKey.trim().length > 0) {
            const aiAnalysis = await generateAISimulation(selectedTeamId, selectedTeam);
            simulationResults.innerHTML = aiAnalysis;
        } else {
            // Use custom championship analysis
            const customAnalysis = generateCustomSimulation(selectedTeamId, selectedTeam);
            simulationResults.innerHTML = customAnalysis;
        }
    } catch (error) {
        console.error('Simulation error:', error);
        // Always fallback to basic simulation on error
        const errorMessage = `
            <div class="ai-powered-badge">
                <small>⚠️ Analysis temporarily unavailable - showing basic scenarios</small>
            </div>
        `;
        simulationResults.innerHTML = errorMessage + generateFallbackSimulation(selectedTeamId, selectedTeam);
    }
}

async function generateAISimulation(teamId, team) {
    // This function now assumes API key is available
    if (!OPENAI_CONFIG.apiKey || OPENAI_CONFIG.apiKey.trim().length === 0) {
        throw new Error('API key not available');
    }

    const currentStandings = calculateStandings();
    const teamStanding = currentStandings.find(t => t.id === teamId);
    const currentPosition = currentStandings.findIndex(t => t.id === teamId) + 1;
    const remainingMatches = getRemainingMatches(teamId);
    const nextGameweek = findNextGameweek();
    
    // Prepare data for AI analysis
    const contextData = prepareAIContext(teamId, team, currentStandings, nextGameweek);
    
    try {
        const aiInsights = await queryOpenAI(contextData);
        return generateAISimulationHTML(teamId, team, currentStandings, remainingMatches, aiInsights);
    } catch (error) {
        console.error('OpenAI API error:', error);
        throw error;
    }
}

function generateAPIKeyPrompt() {
    return `
        <div class="api-key-prompt">
            <div class="simulation-header">🔑 OpenAI API Key Required</div>
            <div class="simulation-content">
                <p>To enable AI-powered championship analysis, please provide your OpenAI API key:</p>
                <div style="margin: 15px 0;">
                    <input type="password" id="openai-key-input" placeholder="Enter your OpenAI API key" style="width: 300px; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                    <button onclick="saveAPIKey()" style="margin-left: 10px; padding: 8px 15px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">Save Key</button>
                </div>
                <p style="font-size: 0.9em; color: #666;">Your API key is stored locally and never sent to our servers. Get your key at <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI Platform</a>.</p>
            </div>
        </div>
    `;
}

function saveAPIKey() {
    const keyInput = document.getElementById('openai-key-input');
    const apiKey = keyInput.value.trim();
    
    if (apiKey) {
        setOpenAIKey(apiKey);
        updateSimulation(); // Refresh simulation with AI
    } else {
        alert('Please enter a valid API key');
    }
}

function prepareAIContext(teamId, team, standings, nextGameweek) {
    const teamPosition = standings.findIndex(t => t.id === teamId) + 1;
    const teamsAbove = standings.slice(0, teamPosition - 1);
    const teamsBelow = standings.slice(teamPosition);
    
    // Get next gameweek matches involving top teams
    const relevantMatches = nextGameweek ? nextGameweek.matches.filter(match => {
        const topTeamIds = standings.slice(0, Math.min(4, standings.length)).map(t => t.id);
        return topTeamIds.includes(match.homeTeam) || topTeamIds.includes(match.awayTeam);
    }) : [];
    
    // Format matches with team names
    const formattedMatches = relevantMatches.map(match => {
        const homeTeam = teams.find(t => t.id === match.homeTeam);
        const awayTeam = teams.find(t => t.id === match.awayTeam);
        return {
            home: homeTeam.name,
            away: awayTeam.name,
            date: match.date,
            time: match.time,
            isTeamInvolved: match.homeTeam === teamId || match.awayTeam === teamId
        };
    });
    
    return {
        selectedTeam: {
            name: team.name,
            position: teamPosition,
            points: standings.find(t => t.id === teamId).points,
            goalDifference: standings.find(t => t.id === teamId).goalDifference,
            goalsFor: standings.find(t => t.id === teamId).goalsFor,
            matchHistory: standings.find(t => t.id === teamId).matchHistory.slice(-5)
        },
        currentStandings: standings.slice(0, 6).map((team, index) => ({
            position: index + 1,
            name: team.name,
            points: team.points,
            goalDifference: team.goalDifference,
            goalsFor: team.goalsFor
        })),
        nextGameweek: nextGameweek ? {
            gameweek: nextGameweek.gameweek,
            matches: formattedMatches
        } : null,
        remainingMatches: getRemainingMatches(teamId).length
    };
}

async function queryOpenAI(contextData) {
    const prompt = generateAIPrompt(contextData);
    
    // Validate API key without logging it
    if (!OPENAI_CONFIG.apiKey || OPENAI_CONFIG.apiKey.trim().length === 0) {
        throw new Error('API key is required for AI analysis');
    }
    
    try {
        const response = await fetch(OPENAI_CONFIG.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`
            },
            body: JSON.stringify({
                model: OPENAI_CONFIG.model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert football championship analyst. Analyze match scenarios and provide strategic insights about what needs to happen for teams to reach or maintain 1st place in the championship standings.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 1000,
                temperature: 0.7
            })
        });
        
        if (!response.ok) {
            const errorData = await response.text();
            console.error('API Error Details:', {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                errorData: errorData
            });
            
            if (response.status === 401) {
                throw new Error('Invalid API key. Please check your OpenAI API key.');
            } else if (response.status === 404) {
                throw new Error(`API endpoint not found (404). This might be a CORS issue when running from file://. Error: ${errorData}`);
            } else if (response.status === 429) {
                throw new Error('API rate limit exceeded. Please try again later.');
            } else {
                throw new Error(`OpenAI API error: ${response.status} - ${errorData}`);
            }
        }
        
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        if (error.message.includes('fetch')) {
            throw new Error('Network error: Please check your internet connection.');
        }
        throw error;
    }
}

function generateAIPrompt(contextData) {
    const { selectedTeam, currentStandings, nextGameweek } = contextData;
    
    return `
Analyze the championship scenario for ${selectedTeam.name} and provide strategic insights.

CURRENT STANDINGS:
${currentStandings.map(team => 
    `${team.position}. ${team.name} - ${team.points} pts (GD: ${team.goalDifference > 0 ? '+' : ''}${team.goalDifference})`
).join('\n')}

SELECTED TEAM: ${selectedTeam.name}
- Current Position: ${selectedTeam.position}${getOrdinalSuffix(selectedTeam.position)}
- Points: ${selectedTeam.points}
- Goal Difference: ${selectedTeam.goalDifference > 0 ? '+' : ''}${selectedTeam.goalDifference}
- Recent Form: ${selectedTeam.matchHistory.join('-')}
- Remaining Matches: ${contextData.remainingMatches}

${nextGameweek ? `
NEXT GAMEWEEK ${nextGameweek.gameweek} FIXTURES:
${nextGameweek.matches.map(match => 
    `${match.home} vs ${match.away}${match.isTeamInvolved ? ' ⭐ (YOUR TEAM)' : ''}`
).join('\n')}
` : 'No upcoming fixtures scheduled.'}

Please provide a comprehensive analysis in the following JSON format:
{
    "toReachFirst": {
        "yourTeamNeeds": "What your team must do (win/draw/lose scenarios)",
        "otherTeamsNeeds": "What other teams need to do to help you",
        "probability": "high/medium/low",
        "keyFactors": ["factor1", "factor2", "factor3"]
    },
    "toMaintainFirst": {
        "applicable": true/false,
        "requirements": "What's needed to stay 1st (if currently 1st)",
        "threats": ["threat1", "threat2"]
    },
    "toAvoidDrop": {
        "dangerousScenarios": ["scenario1", "scenario2"],
        "safetyRequirements": "What you need to avoid dropping",
        "riskLevel": "high/medium/low"
    },
    "strategicInsights": [
        "insight1",
        "insight2", 
        "insight3"
    ],
    "summary": "Brief 2-3 sentence summary of the championship situation"
}

Focus on realistic match outcomes and strategic implications. Consider tie-breakers (goal difference, goals scored, head-to-head).
`;
}

function generateAISimulationHTML(teamId, team, standings, remainingMatches, aiInsights) {
    const teamStanding = standings.find(t => t.id === teamId);
    const currentPosition = standings.findIndex(t => t.id === teamId) + 1;
    
    let parsedInsights;
    try {
        // Try to parse JSON response
        const jsonMatch = aiInsights.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            parsedInsights = JSON.parse(jsonMatch[0]);
        } else {
            throw new Error('No JSON found in response');
        }
    } catch (error) {
        // Fallback to text analysis
        parsedInsights = parseTextInsights(aiInsights);
    }
    
    return `
        <div class="simulation-section">
            <div class="simulation-header">
                🤖 AI Championship Analysis for <span class="selected-team-highlight">${team.name}</span>
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
                            <div class="stat-value ${getGoalDiffClass(teamStanding.goalDifference)}">${teamStanding.goalDifference > 0 ? '+' : ''}${teamStanding.goalDifference}</div>
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
                🏆 Championship Scenarios
            </div>
            <div class="simulation-content">
                ${generateAIInsightsHTML(parsedInsights, currentPosition)}
            </div>
        </div>
        
        <div class="simulation-section">
            <div class="simulation-header">
                📊 Strategic Summary
            </div>
            <div class="simulation-content">
                <div class="ai-summary">
                    ${parsedInsights.summary || 'Championship analysis complete.'}
                </div>
                <div class="ai-powered-badge">
                    <small>🤖 Powered by OpenAI GPT-4</small>
                </div>
            </div>
        </div>
    `;
}

function generateAIInsightsHTML(insights, currentPosition) {
    let html = '';
    
    // To Reach First Place
    if (currentPosition > 1 && insights.toReachFirst) {
        const probabilityClass = `probability-${insights.toReachFirst.probability || 'medium'}`;
        html += `
            <div class="ai-scenario result-good">
                <div class="scenario-title">🥇 Path to 1st Place</div>
                <div class="scenario-description">${insights.toReachFirst.yourTeamNeeds || 'Win your matches and hope for favorable results.'}</div>
                <div style="margin-top: 10px;">
                    <strong>Requirements:</strong>
                    <ul style="margin: 5px 0 0 20px;">
                        <li>Your team: ${insights.toReachFirst.yourTeamNeeds || 'Strong performance needed'}</li>
                        <li>Other teams: ${insights.toReachFirst.otherTeamsNeeds || 'Need competitors to drop points'}</li>
                        ${insights.toReachFirst.keyFactors ? insights.toReachFirst.keyFactors.map(factor => `<li>${factor}</li>`).join('') : ''}
                    </ul>
                </div>
                <span class="scenario-probability ${probabilityClass}">
                    ${insights.toReachFirst.probability ? insights.toReachFirst.probability.charAt(0).toUpperCase() + insights.toReachFirst.probability.slice(1) : 'Medium'} Probability
                </span>
            </div>
        `;
    }
    
    // To Maintain First Place
    if (currentPosition === 1 && insights.toMaintainFirst && insights.toMaintainFirst.applicable) {
        html += `
            <div class="ai-scenario result-good">
                <div class="scenario-title">👑 Maintaining Leadership</div>
                <div class="scenario-description">${insights.toMaintainFirst.requirements || 'Keep performing well to stay on top.'}</div>
                ${insights.toMaintainFirst.threats && insights.toMaintainFirst.threats.length > 0 ? `
                    <div style="margin-top: 10px;">
                        <strong>Threats to Watch:</strong>
                        <ul style="margin: 5px 0 0 20px;">
                            ${insights.toMaintainFirst.threats.map(threat => `<li>${threat}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                <span class="scenario-probability probability-high">High Priority</span>
            </div>
        `;
    }
    
    // To Avoid Dropping
    if (insights.toAvoidDrop) {
        const riskClass = insights.toAvoidDrop.riskLevel === 'high' ? 'result-bad' : 
                         insights.toAvoidDrop.riskLevel === 'medium' ? 'result-neutral' : 'result-good';
        html += `
            <div class="ai-scenario ${riskClass}">
                <div class="scenario-title">🛡️ Avoiding Position Drop</div>
                <div class="scenario-description">${insights.toAvoidDrop.safetyRequirements || 'Maintain current form to avoid dropping.'}</div>
                ${insights.toAvoidDrop.dangerousScenarios && insights.toAvoidDrop.dangerousScenarios.length > 0 ? `
                    <div style="margin-top: 10px;">
                        <strong>Dangerous Scenarios:</strong>
                        <ul style="margin: 5px 0 0 20px;">
                            ${insights.toAvoidDrop.dangerousScenarios.map(scenario => `<li>${scenario}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                <span class="scenario-probability probability-${insights.toAvoidDrop.riskLevel || 'medium'}">
                    ${insights.toAvoidDrop.riskLevel ? insights.toAvoidDrop.riskLevel.charAt(0).toUpperCase() + insights.toAvoidDrop.riskLevel.slice(1) : 'Medium'} Risk
                </span>
            </div>
        `;
    }
    
    // Strategic Insights
    if (insights.strategicInsights && insights.strategicInsights.length > 0) {
        html += `
            <div class="ai-scenario result-neutral">
                <div class="scenario-title">💡 Strategic Insights</div>
                <div class="scenario-description">Key factors that could influence your championship chances:</div>
                <div style="margin-top: 10px;">
                    <ul style="margin: 5px 0 0 20px;">
                        ${insights.strategicInsights.map(insight => `<li>${insight}</li>`).join('')}
                    </ul>
                </div>
                <span class="scenario-probability probability-medium">Expert Analysis</span>
            </div>
        `;
    }
    
    return html || '<p>AI analysis in progress...</p>';
}

function parseTextInsights(aiText) {
    // Fallback text parser for when JSON parsing fails
    return {
        toReachFirst: {
            yourTeamNeeds: extractTextBetween(aiText, 'your team', ['other teams', 'maintain', 'avoid']),
            probability: aiText.toLowerCase().includes('high') ? 'high' : 
                        aiText.toLowerCase().includes('low') ? 'low' : 'medium',
            keyFactors: []
        },
        toMaintainFirst: {
            applicable: aiText.toLowerCase().includes('maintain') || aiText.toLowerCase().includes('stay'),
            requirements: extractTextBetween(aiText, 'maintain', ['avoid', 'drop', 'insight']),
            threats: []
        },
        toAvoidDrop: {
            dangerousScenarios: [],
            safetyRequirements: extractTextBetween(aiText, 'avoid', ['insight', 'summary']),
            riskLevel: aiText.toLowerCase().includes('high risk') ? 'high' : 'medium'
        },
        strategicInsights: aiText.split('\n').filter(line => 
            line.includes('•') || line.includes('-') || line.includes('*')
        ).slice(0, 3),
        summary: aiText.split('\n').slice(-3).join(' ').substring(0, 200) + '...'
    };
}

function extractTextBetween(text, startKeyword, endKeywords) {
    const startIndex = text.toLowerCase().indexOf(startKeyword.toLowerCase());
    if (startIndex === -1) return '';
    
    let endIndex = text.length;
    endKeywords.forEach(keyword => {
        const keywordIndex = text.toLowerCase().indexOf(keyword.toLowerCase(), startIndex + startKeyword.length);
        if (keywordIndex !== -1 && keywordIndex < endIndex) {
            endIndex = keywordIndex;
        }
    });
    
    return text.substring(startIndex, endIndex).substring(startKeyword.length).trim();
}

function generateCustomSimulation(teamId, team) {
    // Custom championship analysis within points gap
    const currentStandings = calculateStandings();
    const teamStanding = currentStandings.find(t => t.id === teamId);
    const currentPosition = currentStandings.findIndex(t => t.id === teamId) + 1;
    const remainingMatches = getRemainingMatches(teamId);
    
    // Get teams within 3-point gap
    const relevantTeams = getTeamsWithinGap(currentStandings, teamId, SIMULATION_CONFIG.pointsGapLimit);
    
    // Calculate all possible scenarios
    const scenarios = calculateAdvancedScenarios(teamId, currentStandings, relevantTeams);
    
    return `
        <div class="simulation-section">
            <div class="simulation-header">
                🏆 Next Gameweek Analysis for <span class="selected-team-highlight">${team.name}</span>
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
                            <div class="stat-value ${getGoalDiffClass(teamStanding.goalDifference)}">${teamStanding.goalDifference > 0 ? '+' : ''}${teamStanding.goalDifference}</div>
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
                
                <div class="relevant-teams">
                    <h4>Teams Within ${SIMULATION_CONFIG.pointsGapLimit}-Point Gap (Next Gameweek Focus)</h4>
                    <div class="teams-list">
                        ${relevantTeams.map(team => {
                            const nextGameweek = findNextGameweek();
                            const hasMatch = nextGameweek ? nextGameweek.matches.some(match => 
                                match.homeTeam === team.id || match.awayTeam === team.id
                            ) : false;
                            const matchIndicator = hasMatch ? '⚽' : '🚫';
                            
                            return `
                            <div class="team-item ${team.id === teamId ? 'current-team' : ''}">
                                <span class="team-position">${team.position}</span>
                                <span class="team-name">${team.name} ${matchIndicator}</span>
                                <span class="team-points">${team.points} pts</span>
                                <span class="team-gap">${team.gap > 0 ? '+' : ''}${team.gap}</span>
                            </div>
                        `;}).join('')}
                    </div>
                    <p style="font-size: 0.8rem; margin-top: 10px; color: #666;">
                        ⚽ = Plays next gameweek | 🚫 = No match scheduled
                    </p>
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
                📊 Next Gameweek Scenario Analysis for <span class="selected-team-highlight">${team.name}</span>
            </div>
            <div class="simulation-content">
                ${generateAdvancedScenariosHTML(scenarios, currentPosition)}
            </div>
        </div>
        
        <div class="simulation-section">
            <div class="simulation-header">
                📈 Strategic Summary
            </div>
            <div class="simulation-content">
                <div class="strategic-summary">
                    <p><strong>Next Gameweek Focus:</strong> Immediate impact scenarios only</p>
                    <p><strong>Teams in Analysis:</strong> ${relevantTeams.length - 1} competitors within ${SIMULATION_CONFIG.pointsGapLimit}-point gap</p>
                    <p><strong>Scenarios for Next Round:</strong> ${scenarios.length} possible outcomes</p>
                    <p><strong>Analysis Type:</strong> Win/Draw/Loss impact on position</p>
                </div>
            </div>
        </div>
    `;
}

function generateFallbackSimulation(teamId, team) {
    // Fallback simulation when AI is not available
    const currentStandings = calculateStandings();
    const teamStanding = currentStandings.find(t => t.id === teamId);
    const currentPosition = currentStandings.findIndex(t => t.id === teamId) + 1;
    const remainingMatches = getRemainingMatches(teamId);
    const scenarios = calculateBasicScenarios(teamId, currentStandings);
    
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
                            <div class="stat-value ${getGoalDiffClass(teamStanding.goalDifference)}">${teamStanding.goalDifference > 0 ? '+' : ''}${teamStanding.goalDifference}</div>
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
                Basic Championship Scenarios for <span class="selected-team-highlight">${team.name}</span>
            </div>
            <div class="simulation-content">
                ${scenarios.length > 0 ? `
                    <ul class="scenarios-list">
                        ${scenarios.map(scenario => `
                            <li class="scenario-item result-${scenario.resultType || 'neutral'}">
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
                                <span class="scenario-probability probability-${scenario.probability}">
                                    ${scenario.probability === 'none' ? 'Not Possible' : scenario.probability.charAt(0).toUpperCase() + scenario.probability.slice(1) + ' Probability'}
                                </span>
                            </li>
                        `).join('')}
                    </ul>
                ` : '<p>No viable championship scenarios available for next gameweek with current standings and remaining matches.</p>'}
                <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; text-align: center;">
                    <p><strong>💡 Want AI-powered insights?</strong></p>
                    <p>Add your OpenAI API key above to get intelligent championship analysis!</p>
                </div>
            </div>
        </div>
    `;
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
                            <div class="stat-value ${getGoalDiffClass(teamStanding.goalDifference)}">${teamStanding.goalDifference > 0 ? '+' : ''}${teamStanding.goalDifference}</div>
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
                Next Gameweek Scenarios for <span class="selected-team-highlight">${team.name}</span>
            </div>
            <div class="simulation-content">
                ${scenarios.length > 0 ? `
                    <ul class="scenarios-list">
                        ${scenarios.map(scenario => `
                            <li class="scenario-item result-${scenario.resultType || 'neutral'}">
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
                                <span class="scenario-probability probability-${scenario.probability}">
                                    ${scenario.probability === 'none' ? 'Not Possible' : scenario.probability.charAt(0).toUpperCase() + scenario.probability.slice(1) + ' Probability'}
                                </span>
                            </li>
                        `).join('')}
                    </ul>
                ` : '<p>No viable championship scenarios available for next gameweek with current standings and remaining matches.</p>'}
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

function getTeamsWithinGap(standings, selectedTeamId, pointsGap) {
    const selectedTeam = standings.find(t => t.id === selectedTeamId);
    const selectedPosition = standings.findIndex(t => t.id === selectedTeamId) + 1;
    
    return standings.map((team, index) => ({
        ...team,
        position: index + 1,
        gap: team.points - selectedTeam.points
    })).filter(team => {
        const gap = Math.abs(team.points - selectedTeam.points);
        return gap <= pointsGap;
    });
}

function calculateAdvancedScenarios(selectedTeamId, standings, relevantTeams) {
    const scenarios = [];
    const selectedTeam = standings.find(t => t.id === selectedTeamId);
    const currentPosition = standings.findIndex(t => t.id === selectedTeamId) + 1;
    
    // Get next gameweek instead of all remaining matches
    const nextGameweek = findNextGameweek();
    if (!nextGameweek) {
        return [{
            type: 'no-matches',
            title: 'No Upcoming Matches',
            description: 'No matches scheduled for the next gameweek.',
            requirements: [],
            probability: 'none',
            resultType: 'neutral'
        }];
    }
    
    // Find selected team's match
    const selectedMatch = nextGameweek.matches.find(match => 
        match.homeTeam === selectedTeamId || match.awayTeam === selectedTeamId
    );
    
    if (!selectedMatch) {
        // Team doesn't play - analyze other teams' results only
        return calculateRestGameweekScenarios(selectedTeamId, standings, relevantTeams, nextGameweek);
    }
    
    // Get opponent info
    const opponentId = selectedMatch.homeTeam === selectedTeamId ? selectedMatch.awayTeam : selectedMatch.homeTeam;
    const opponent = teams.find(t => t.id === opponentId);
    const isHome = selectedMatch.homeTeam === selectedTeamId;
    const venue = isHome ? 'vs' : 'at';
    
    // For each possible result of selected team (WIN, DRAW, LOSS)
    const teamResults = ['win', 'draw', 'loss'];
    
    teamResults.forEach(result => {
        const scenario = calculateComprehensiveScenarios(
            selectedTeamId, result, opponent, venue, 
            standings, relevantTeams, nextGameweek
        );
        scenarios.push(scenario);
    });
    
    return scenarios;
}

function getNextGameweekMatchesForTeams(relevantTeams, nextGameweek) {
    const teamIds = relevantTeams.map(t => t.id);
    const relevantMatches = {};
    
    relevantTeams.forEach(team => {
        relevantMatches[team.id] = nextGameweek.matches.find(match => 
            match.homeTeam === team.id || match.awayTeam === team.id
        );
    });
    
    return relevantMatches;
}

function calculateNextGameweekScenarios(selectedTeamId, standings, relevantTeams, nextGameweek, nextGameweekMatches) {
    const scenarios = [];
    const selectedTeam = standings.find(t => t.id === selectedTeamId);
    const currentPosition = standings.findIndex(t => t.id === selectedTeamId) + 1;
    const selectedMatch = nextGameweekMatches[selectedTeamId];
    
    if (!selectedMatch) {
        // Team doesn't play in next gameweek
        const restScenarios = calculateRestGameweekScenarios(selectedTeamId, standings, relevantTeams, nextGameweek, nextGameweekMatches);
        scenarios.push(...restScenarios);
        return scenarios;
    }
    
    // Team plays in next gameweek - calculate WIN, DRAW, LOSS scenarios
    const opponentId = selectedMatch.homeTeam === selectedTeamId ? selectedMatch.awayTeam : selectedMatch.homeTeam;
    const opponent = teams.find(t => t.id === opponentId);
    const isHome = selectedMatch.homeTeam === selectedTeamId;
    
    // Generate scenarios for each possible result
    const winScenarios = calculateNextGameweekResultScenarios(selectedTeamId, standings, relevantTeams, nextGameweek, nextGameweekMatches, 'win', opponent, isHome);
    const drawScenarios = calculateNextGameweekResultScenarios(selectedTeamId, standings, relevantTeams, nextGameweek, nextGameweekMatches, 'draw', opponent, isHome);
    const lossScenarios = calculateNextGameweekResultScenarios(selectedTeamId, standings, relevantTeams, nextGameweek, nextGameweekMatches, 'loss', opponent, isHome);
    
    return [...winScenarios, ...drawScenarios, ...lossScenarios];
}

function calculateReachFirstScenarios(selectedTeamId, relevantTeams, allRemainingMatches) {
    const scenarios = [];
    const selectedTeam = relevantTeams.find(t => t.id === selectedTeamId);
    const currentLeader = relevantTeams.find(t => t.position === 1);
    
    if (!currentLeader || selectedTeam.position === 1) return scenarios;
    
    const pointsNeeded = currentLeader.points - selectedTeam.points + 1; // Points needed to overtake
    const remainingMatches = allRemainingMatches[selectedTeamId];
    const maxPossiblePoints = remainingMatches.length * 3; // Maximum points if win all
    
    if (pointsNeeded <= maxPossiblePoints) {
        // Calculate specific combinations
        const combinations = generateWinDrawLossCombinations(remainingMatches.length, pointsNeeded);
        
        combinations.forEach(combo => {
            scenarios.push({
                type: 'reach-first',
                title: `🥇 Path to 1st Place`,
                description: `Win ${combo.wins} matches, draw ${combo.draws}, lose ${combo.losses}. Need ${currentLeader.name} to drop points.`,
                requirements: [
                    `Your team: ${combo.wins}W-${combo.draws}D-${combo.losses}L`,
                    `${currentLeader.name} must not win all remaining matches`,
                    `Focus on goal difference for potential tie-breakers`
                ],
                probability: calculateScenarioProbability(combo, selectedTeam, currentLeader),
                resultType: 'good',
                color: 'green'
            });
        });
    }
    
    return scenarios;
}

function calculateMaintainFirstScenarios(selectedTeamId, relevantTeams, allRemainingMatches) {
    const scenarios = [];
    const selectedTeam = relevantTeams.find(t => t.id === selectedTeamId);
    const threats = relevantTeams.filter(t => t.position > 1 && t.position <= 4); // Top 4 threats
    
    threats.forEach(threat => {
        const threatRemainingMatches = allRemainingMatches[threat.id];
        const maxThreatPoints = threat.points + (threatRemainingMatches.length * 3);
        
        if (maxThreatPoints >= selectedTeam.points) {
            scenarios.push({
                type: 'maintain-first',
                title: `👑 Defend Against ${threat.name}`,
                description: `Stay ahead of ${threat.name} (currently ${threat.points} pts). They can reach ${maxThreatPoints} pts maximum.`,
                requirements: [
                    `Maintain points advantage over ${threat.name}`,
                    `Win key matches to stay ahead`,
                    `Monitor their results closely`
                ],
                probability: 'medium',
                resultType: 'good',
                color: 'yellow'
            });
        }
    });
    
    return scenarios;
}

function calculateMaintainPositionScenarios(selectedTeamId, relevantTeams, allRemainingMatches, currentPosition) {
    const scenarios = [];
    const selectedTeam = relevantTeams.find(t => t.id === selectedTeamId);
    const teamsBelow = relevantTeams.filter(t => t.position > currentPosition);
    
    teamsBelow.forEach(teamBelow => {
        const remainingMatches = allRemainingMatches[teamBelow.id];
        const maxPoints = teamBelow.points + (remainingMatches.length * 3);
        
        if (maxPoints >= selectedTeam.points) {
            scenarios.push({
                type: 'maintain-position',
                title: `🛡️ Stay Above ${teamBelow.name}`,
                description: `Keep your ${currentPosition}${getOrdinalSuffix(currentPosition)} place ahead of ${teamBelow.name} (${teamBelow.points} pts).`,
                requirements: [
                    `Match or exceed ${teamBelow.name}'s performance`,
                    `Don't let them gain more than ${selectedTeam.points - teamBelow.points} points on you`,
                    `Focus on consistent results`
                ],
                probability: 'medium',
                resultType: 'neutral',
                color: 'yellow'
            });
        }
    });
    
    return scenarios;
}

function calculateDropPositionScenarios(selectedTeamId, relevantTeams, allRemainingMatches, currentPosition) {
    const scenarios = [];
    const selectedTeam = relevantTeams.find(t => t.id === selectedTeamId);
    const teamsBelow = relevantTeams.filter(t => t.position > currentPosition);
    
    teamsBelow.forEach(teamBelow => {
        const remainingMatches = allRemainingMatches[teamBelow.id];
        const selectedRemainingMatches = allRemainingMatches[selectedTeamId];
        
        // Calculate if this team can overtake with good results
        const minPointsToOvertake = selectedTeam.points + 1;
        const maxPossiblePoints = teamBelow.points + (remainingMatches.length * 3);
        
        if (maxPossiblePoints >= minPointsToOvertake) {
            scenarios.push({
                type: 'drop-position',
                title: `⚠️ Risk from ${teamBelow.name}`,
                description: `Could drop below ${teamBelow.name} if they win ${Math.ceil((minPointsToOvertake - teamBelow.points) / 3)} more matches than you.`,
                requirements: [
                    `Avoid losing while ${teamBelow.name} wins`,
                    `Don't let them win ${Math.ceil((selectedTeam.points - teamBelow.points + 1) / 3)} more matches than you`,
                    `Maintain performance consistency`
                ],
                probability: calculateDropRisk(selectedTeam, teamBelow, selectedRemainingMatches, remainingMatches),
                resultType: 'bad',
                color: 'red'
            });
        }
    });
    
    return scenarios;
}

function generateWinDrawLossCombinations(totalMatches, pointsNeeded) {
    const combinations = [];
    
    // Try different combinations of wins, draws, losses
    for (let wins = 0; wins <= totalMatches; wins++) {
        for (let draws = 0; draws <= totalMatches - wins; draws++) {
            const losses = totalMatches - wins - draws;
            const points = (wins * 3) + (draws * 1);
            
            if (points >= pointsNeeded && combinations.length < 3) { // Limit to top 3 combinations
                combinations.push({ wins, draws, losses, points });
            }
        }
    }
    
    // Sort by efficiency (fewer losses preferred)
    return combinations.sort((a, b) => a.losses - b.losses);
}

function calculateScenarioProbability(combo, selectedTeam, opponent) {
    const totalMatches = combo.wins + combo.draws + combo.losses;
    const winRate = combo.wins / totalMatches;
    
    if (winRate >= 0.8) return 'low';    // Very ambitious
    if (winRate >= 0.6) return 'medium'; // Reasonable
    return 'high';                       // Conservative
}

function calculateDropRisk(selectedTeam, threatTeam, selectedMatches, threatMatches) {
    const pointsGap = selectedTeam.points - threatTeam.points;
    const matchesDifference = Math.abs(selectedMatches.length - threatMatches.length);
    
    if (pointsGap <= 1 || matchesDifference >= 2) return 'high';
    if (pointsGap <= 3) return 'medium';
    return 'low';
}

function calculateNextGameweekResultScenarios(selectedTeamId, standings, relevantTeams, nextGameweek, nextGameweekMatches, result, opponent, isHome) {
    const scenarios = [];
    
    // Safety checks
    if (!selectedTeamId || !standings || !opponent) {
        return scenarios;
    }
    
    const selectedTeam = standings.find(t => t.id === selectedTeamId);
    if (!selectedTeam) {
        return scenarios;
    }
    
    const currentPosition = standings.findIndex(t => t.id === selectedTeamId) + 1;
    const venue = isHome ? 'vs' : 'at';
    
    // Simulate the result and see what happens
    const projectedStandings = simulateNextGameweekResult(selectedTeamId, result, opponent.id, standings, relevantTeams, nextGameweekMatches);
    const newPosition = projectedStandings.findIndex(t => t.id === selectedTeamId) + 1;
    
    // Determine scenario type and description
    let scenarioType, resultType, title, description, requirements;
    
    if (newPosition < currentPosition) {
        // Moving up
        scenarioType = 'advance';
        resultType = 'good';
        title = `🥇 If You ${result.toUpperCase()} ${venue} ${opponent.name}`;
        description = `You would move up to ${newPosition}${getOrdinalSuffix(newPosition)} place!`;
        requirements = [
            `${result === 'win' ? 'Win' : result === 'draw' ? 'Draw' : 'Even with a loss'} against ${opponent.name}`,
            `Other results work in your favor`,
            `Take advantage of competitors dropping points`
        ];
    } else if (newPosition > currentPosition) {
        // Moving down
        scenarioType = 'drop';
        resultType = 'bad';
        title = `⚠️ If You ${result.toUpperCase()} ${venue} ${opponent.name}`;
        description = `You could drop to ${newPosition}${getOrdinalSuffix(newPosition)} place.`;
        requirements = [
            `Avoid ${result === 'loss' ? 'losing' : result === 'draw' ? 'drawing' : 'this result'} against ${opponent.name}`,
            `Need better performance to maintain position`,
            `Watch competitors' results closely`
        ];
    } else {
        // Staying same
        scenarioType = 'maintain';
        resultType = 'neutral';
        title = `🛡️ If You ${result.toUpperCase()} ${venue} ${opponent.name}`;
        description = `You would maintain your ${currentPosition}${getOrdinalSuffix(currentPosition)} place position.`;
        requirements = [
            `${result === 'win' ? 'Win' : result === 'draw' ? 'Draw with' : 'Minimize damage against'} ${opponent.name}`,
            `Current form sufficient to maintain position`,
            `Stay consistent with performance`
        ];
    }
    
    // Calculate probability based on team strength and venue
    const probability = calculateResultProbability(result, selectedTeam, opponent, isHome, standings);
    
    scenarios.push({
        type: scenarioType,
        title: title,
        description: description,
        requirements: requirements,
        probability: probability,
        resultType: resultType,
        newPosition: newPosition,
        currentPosition: currentPosition
    });
    
    return scenarios;
}

function calculateRestGameweekScenarios(selectedTeamId, standings, relevantTeams, nextGameweek, nextGameweekMatches) {
    const scenarios = [];
    const selectedTeam = standings.find(t => t.id === selectedTeamId);
    const currentPosition = standings.findIndex(t => t.id === selectedTeamId) + 1;
    
    // Find which relevant teams are playing
    const playingTeams = relevantTeams.filter(team => nextGameweekMatches[team.id]);
    
    if (playingTeams.length === 0) {
        scenarios.push({
            type: 'no-action',
            title: '🚫 Rest Gameweek - No Relevant Matches',
            description: `You don't play in Gameweek ${nextGameweek.gameweek}, and no teams within the 3-point gap are playing either.`,
            requirements: ['Wait for next gameweek', 'Position remains unchanged'],
            probability: 'high',
            resultType: 'neutral'
        });
    } else {
        scenarios.push({
            type: 'watch-others',
            title: `👀 Rest Gameweek - Watch Competitors`,
            description: `You don't play in Gameweek ${nextGameweek.gameweek}. ${playingTeams.length} relevant team(s) are playing: ${playingTeams.map(t => t.name).join(', ')}.`,
            requirements: [
                'Monitor competitors\' results carefully',
                'Position could change based on their performance',
                'Prepare for next gameweek matches'
            ],
            probability: 'high',
            resultType: 'neutral'
        });
    }
    
    return scenarios;
}

function simulateNextGameweekResult(selectedTeamId, result, opponentId, standings, relevantTeams, nextGameweekMatches) {
    // Safety checks
    if (!standings || !selectedTeamId || !result) {
        return standings || [];
    }
    
    // Create a copy of standings to simulate
    const simStandings = JSON.parse(JSON.stringify(standings));
    
    // Apply the selected team's result
    const selectedTeamStanding = simStandings.find(t => t.id === selectedTeamId);
    const opponentStanding = opponentId ? simStandings.find(t => t.id === opponentId) : null;
    
    if (selectedTeamStanding) {
        if (result === 'win') {
            selectedTeamStanding.points = (selectedTeamStanding.points || 0) + 3;
            selectedTeamStanding.wins = (selectedTeamStanding.wins || 0) + 1;
            if (opponentStanding) {
                opponentStanding.losses = (opponentStanding.losses || 0) + 1;
            }
        } else if (result === 'draw') {
            selectedTeamStanding.points = (selectedTeamStanding.points || 0) + 1;
            selectedTeamStanding.draws = (selectedTeamStanding.draws || 0) + 1;
            if (opponentStanding) {
                opponentStanding.points = (opponentStanding.points || 0) + 1;
                opponentStanding.draws = (opponentStanding.draws || 0) + 1;
            }
        } else if (result === 'loss') {
            selectedTeamStanding.losses = (selectedTeamStanding.losses || 0) + 1;
            if (opponentStanding) {
                opponentStanding.points = (opponentStanding.points || 0) + 3;
                opponentStanding.wins = (opponentStanding.wins || 0) + 1;
            }
        }
    }
    
    // Simulate other relevant teams with average results (assume draws for simplicity)
    if (relevantTeams && nextGameweekMatches) {
        relevantTeams.forEach(team => {
            if (team.id !== selectedTeamId && team.id !== opponentId && nextGameweekMatches[team.id]) {
                const teamStanding = simStandings.find(t => t.id === team.id);
                if (teamStanding) {
                    teamStanding.points = (teamStanding.points || 0) + 1; // Assume draw
                    teamStanding.draws = (teamStanding.draws || 0) + 1;
                }
            }
        });
    }
    
    // Re-sort standings
    simStandings.sort((a, b) => {
        if (a.points !== b.points) return b.points - a.points;
        if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
        return b.goalsFor - a.goalsFor;
    });
    
    return simStandings;
}

function calculateResultProbability(result, selectedTeam, opponent, isHome, standings) {
    const selectedPos = standings.findIndex(t => t.id === selectedTeam.id) + 1;
    const opponentPos = standings.findIndex(t => t.id === opponent.id) + 1;
    
    let baseProbability;
    if (selectedPos < opponentPos) {
        // Playing against lower-ranked team
        baseProbability = result === 'win' ? 'high' : result === 'draw' ? 'medium' : 'low';
    } else if (selectedPos > opponentPos) {
        // Playing against higher-ranked team
        baseProbability = result === 'win' ? 'low' : result === 'draw' ? 'medium' : 'high';
    } else {
        // Similar ranked teams
        baseProbability = 'medium';
    }
    
    // Adjust for home advantage
    if (isHome && result === 'win') {
        return baseProbability === 'low' ? 'medium' : baseProbability === 'medium' ? 'high' : 'high';
    }
    
    return baseProbability;
}

function calculateComprehensiveScenarios(selectedTeamId, result, opponent, venue, standings, relevantTeams, nextGameweek) {
    const selectedTeam = standings.find(t => t.id === selectedTeamId);
    const currentPosition = standings.findIndex(t => t.id === selectedTeamId) + 1;
    const isCurrentlyFirst = currentPosition === 1;
    
    // Calculate selected team's new points
    let selectedNewPoints = selectedTeam.points;
    if (result === 'win') selectedNewPoints += 3;
    else if (result === 'draw') selectedNewPoints += 1;
    
    // Find other relevant teams that play in this gameweek
    const otherTeamsMatches = [];
    relevantTeams.forEach(team => {
        if (team.id !== selectedTeamId) {
            const match = nextGameweek.matches.find(m => 
                m.homeTeam === team.id || m.awayTeam === team.id
            );
            if (match) {
                otherTeamsMatches.push({
                    teamId: team.id,
                    team: team,
                    match: match,
                    isHome: match.homeTeam === team.id
                });
            }
        }
    });
    
    // Generate all possible combinations of results for other teams
    const allCombinations = generateAllResultCombinations(otherTeamsMatches);
    
    // Analyze each combination
    const scenarios = {
        canReachFirst: [],
        maintainFirst: [],
        maintainPosition: [],
        dropPosition: [],
        tieBreakScenarios: []
    };
    
    allCombinations.forEach(combination => {
        const finalStandings = simulateGameweekResults(
            standings, selectedTeamId, selectedNewPoints, combination
        );
        
        const newPosition = finalStandings.findIndex(t => t.id === selectedTeamId) + 1;
        const selectedTeamFinal = finalStandings.find(t => t.id === selectedTeamId);
        
        // Check for ties at first place and create detailed description
        let combinationDesc = describeCombination(combination);
        
        // Check for ties and provide tie-breaker analysis
        const firstPlacePoints = finalStandings[0].points;
        const teamsWithSamePoints = finalStandings.filter(t => t.points === firstPlacePoints);
        
        if (teamsWithSamePoints.length > 1 && selectedTeamFinal.points === firstPlacePoints) {
            // There's a tie for first place - explain tie-breaker
            const otherTiedTeams = teamsWithSamePoints.filter(t => t.id !== selectedTeamId);
            if (otherTiedTeams.length > 0) {
                const tieBreakInfo = analyzeTieBreaker(selectedTeamFinal, otherTiedTeams);
                combinationDesc += ` (${tieBreakInfo})`;
            }
        }
        
        // Special case: if tied for 1st place but loses on tie-breaker, show what's needed
        if (teamsWithSamePoints.length > 1 && selectedTeamFinal.points === firstPlacePoints && newPosition > 1) {
            // Team tied for points but lost on tie-breaker - add to special tie-breaker scenarios
            if (!scenarios.tieBreakScenarios) scenarios.tieBreakScenarios = [];
            scenarios.tieBreakScenarios.push(combinationDesc);
        } else if (newPosition === 1 && !isCurrentlyFirst) {
            scenarios.canReachFirst.push(combinationDesc);
        } else if (newPosition === 1 && isCurrentlyFirst) {
            scenarios.maintainFirst.push(combinationDesc);
        } else if (newPosition === currentPosition) {
            scenarios.maintainPosition.push(combinationDesc);
        } else {
            scenarios.dropPosition.push(combinationDesc);
        }
    });
    
    // Generate the final scenario description
    return generateScenarioDescription(
        result, opponent.name, venue, selectedNewPoints, currentPosition,
        scenarios, isCurrentlyFirst
    );
}

function generateAllResultCombinations(teamMatches) {
    if (teamMatches.length === 0) return [[]];
    
    const results = ['win', 'draw', 'loss'];
    const combinations = [];
    
    function generateCombos(index, currentCombo) {
        if (index >= teamMatches.length) {
            combinations.push([...currentCombo]);
            return;
        }
        
        results.forEach(result => {
            currentCombo[index] = {
                teamId: teamMatches[index].teamId,
                result: result,
                points: result === 'win' ? 3 : result === 'draw' ? 1 : 0
            };
            generateCombos(index + 1, currentCombo);
        });
    }
    
    generateCombos(0, new Array(teamMatches.length));
    return combinations;
}

function simulateGameweekResults(originalStandings, selectedTeamId, selectedNewPoints, otherResults) {
    // Create copy of standings
    const newStandings = originalStandings.map(team => ({...team}));
    
    // Update selected team points and estimate goal changes
    const selectedIndex = newStandings.findIndex(t => t.id === selectedTeamId);
    if (selectedIndex !== -1) {
        const pointsGained = selectedNewPoints - newStandings[selectedIndex].points;
        newStandings[selectedIndex].points = selectedNewPoints;
        
        // Estimate goal changes based on typical results
        if (pointsGained === 3) {
            // Win - estimate 2-goal margin (could be 1-0, 2-0, 3-1, etc.)
            newStandings[selectedIndex].goalsFor += 2;
            newStandings[selectedIndex].goalDifference += 2;
            newStandings[selectedIndex].goalsAgainst = newStandings[selectedIndex].goalsFor - newStandings[selectedIndex].goalDifference;
        } else if (pointsGained === 1) {
            // Draw - estimate 1-1
            newStandings[selectedIndex].goalsFor += 1;
            newStandings[selectedIndex].goalsAgainst += 1;
        }
        // Loss = 0 points gained, assume opponent scored more
    }
    
    // Update other teams' points and estimate goal changes
    otherResults.forEach(result => {
        const teamIndex = newStandings.findIndex(t => t.id === result.teamId);
        if (teamIndex !== -1) {
            const oldPoints = newStandings[teamIndex].points;
            newStandings[teamIndex].points += result.points;
            
            // Estimate goal changes based on result
            if (result.points === 3) {
                // Win - estimate 2-goal margin
                newStandings[teamIndex].goalsFor += 2;
                newStandings[teamIndex].goalDifference += 2;
                newStandings[teamIndex].goalsAgainst = newStandings[teamIndex].goalsFor - newStandings[teamIndex].goalDifference;
            } else if (result.points === 1) {
                // Draw - estimate 1-1
                newStandings[teamIndex].goalsFor += 1;
                newStandings[teamIndex].goalsAgainst += 1;
            }
            // Loss = 0 points, estimate conceding goals but not as precise without opponent info
        }
    });
    
    // Sort by points, then goal difference, then goals for
    newStandings.sort((a, b) => {
        if (a.points !== b.points) return b.points - a.points;
        if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
        return b.goalsFor - a.goalsFor;
    });
    
    return newStandings;
}

function describeCombination(combination) {
    if (combination.length === 0) return "No other relevant matches";
    
    return combination.map(result => {
        const team = teams.find(t => t.id === result.teamId);
        const resultText = result.result === 'win' ? 'wins' : result.result === 'draw' ? 'draws' : 'loses';
        return `${team.name} ${resultText}`;
    }).join(', ');
}

function analyzeTieBreaker(selectedTeam, otherTiedTeams) {
    // Analyze tie-breaker situation with specific examples
    const tieBreakReasons = [];
    
    otherTiedTeams.forEach(otherTeam => {
        if (selectedTeam.goalDifference > otherTeam.goalDifference) {
            tieBreakReasons.push(`wins on GD vs ${otherTeam.name} (${selectedTeam.goalDifference > 0 ? '+' : ''}${selectedTeam.goalDifference} vs ${otherTeam.goalDifference > 0 ? '+' : ''}${otherTeam.goalDifference})`);
        } else if (selectedTeam.goalDifference === otherTeam.goalDifference) {
            if (selectedTeam.goalsFor > otherTeam.goalsFor) {
                tieBreakReasons.push(`wins on goals vs ${otherTeam.name} (${selectedTeam.goalsFor} vs ${otherTeam.goalsFor})`);
            } else if (selectedTeam.goalsFor === otherTeam.goalsFor) {
                tieBreakReasons.push(`tied with ${otherTeam.name} on GD & goals`);
            } else {
                tieBreakReasons.push(`loses on goals to ${otherTeam.name} (${selectedTeam.goalsFor} vs ${otherTeam.goalsFor})`);
            }
        } else {
            // Selected team has worse goal difference - provide examples of what they need
            const gdGap = otherTeam.goalDifference - selectedTeam.goalDifference;
            const currentSelectedGF = selectedTeam.goalsFor;
            const currentSelectedGA = selectedTeam.goalsAgainst;
            
            // Calculate what SCE needs to overcome the GD gap
            const minGoalsNeeded = gdGap + 1; // Need to be at least 1 better
            
            if (otherTeam.name === "Ctrl+Shift+Golo") {
                // Specific examples for the main competitor
                if (gdGap === 5) { // +7 vs +2 = 5 gap
                    tieBreakReasons.push(`needs 6+ goals vs opponent (e.g., 6-0, 7-0) to overtake ${otherTeam.name} on GD`);
                } else {
                    tieBreakReasons.push(`needs ${minGoalsNeeded}+ goal margin to overtake ${otherTeam.name} (GD: ${selectedTeam.goalDifference > 0 ? '+' : ''}${selectedTeam.goalDifference} vs ${otherTeam.goalDifference > 0 ? '+' : ''}${otherTeam.goalDifference})`);
                }
            } else {
                tieBreakReasons.push(`loses on GD to ${otherTeam.name} (${selectedTeam.goalDifference > 0 ? '+' : ''}${selectedTeam.goalDifference} vs ${otherTeam.goalDifference > 0 ? '+' : ''}${otherTeam.goalDifference})`);
            }
        }
    });
    
    return tieBreakReasons.join(', ');
}

function generateScenarioDescription(result, opponentName, venue, newPoints, currentPosition, scenarios, isCurrentlyFirst) {
    const resultAction = result === 'win' ? 'WIN' : result === 'draw' ? 'DRAW' : 'LOSS';
    const title = `${result === 'win' ? '🥇' : result === 'draw' ? '🛡️' : '⚠️'} If You ${resultAction} ${venue} ${opponentName}`;
    
    let description = '';
    let requirements = [];
    let resultType = 'neutral';
    let probability = 'medium';
    
    // Analyze the scenarios
    const totalScenarios = scenarios.canReachFirst.length + scenarios.maintainFirst.length + 
                          scenarios.maintainPosition.length + scenarios.dropPosition.length +
                          scenarios.tieBreakScenarios.length;
    
    if (scenarios.canReachFirst.length > 0) {
        // Can reach 1st place in some scenarios
        const percentage = Math.round((scenarios.canReachFirst.length / totalScenarios) * 100);
        description = `You could reach 1st place with ${newPoints} points in ${scenarios.canReachFirst.length}/${totalScenarios} scenarios (${percentage}%).`;
        
        requirements.push(`${result === 'win' ? 'Beat' : result === 'draw' ? 'Draw with' : 'Limit damage against'} ${opponentName}`);
        
        requirements.push("Scenarios for 1st place:");
        scenarios.canReachFirst.forEach(scenario => {
            requirements.push(`• ${scenario}`);
        });
        
        // Add tie-breaker scenarios if they exist
        if (scenarios.tieBreakScenarios.length > 0) {
            requirements.push("Tie-breaker scenarios (need superior goal stats):");
            scenarios.tieBreakScenarios.forEach(scenario => {
                requirements.push(`• ${scenario}`);
            });
        }
        
        resultType = 'good';
        probability = result === 'win' ? 'high' : result === 'draw' ? 'medium' : 'low';
        
    } else if (scenarios.maintainFirst.length > 0) {
        // Maintain 1st place
        const percentage = Math.round((scenarios.maintainFirst.length / totalScenarios) * 100);
        description = `You would maintain 1st place with ${newPoints} points in ${scenarios.maintainFirst.length}/${totalScenarios} scenarios (${percentage}%).`;
        
        requirements.push(`${result === 'win' ? 'Beat' : result === 'draw' ? 'Draw with' : 'Limit damage against'} ${opponentName}`);
        requirements.push(`${percentage}% chance to stay 1st`);
        
        resultType = 'good';
        probability = 'high';
        
    } else if (scenarios.maintainPosition.length === totalScenarios) {
        // Always maintain current position
        description = `You would maintain ${currentPosition}${getOrdinalSuffix(currentPosition)} place with ${newPoints} points regardless of other results.`;
        
        requirements.push(`${result === 'win' ? 'Beat' : result === 'draw' ? 'Draw with' : 'Limit damage against'} ${opponentName}`);
        requirements.push('Position secure regardless of other matches');
        
        resultType = 'neutral';
        
    } else {
        // Mixed outcomes or position drops
        const maintainPercentage = Math.round((scenarios.maintainPosition.length / totalScenarios) * 100);
        const dropPercentage = Math.round((scenarios.dropPosition.length / totalScenarios) * 100);
        
        if (scenarios.dropPosition.length > scenarios.maintainPosition.length) {
            description = `You would likely drop position with ${newPoints} points. Drop in ${dropPercentage}% of scenarios, maintain position in ${maintainPercentage}%.`;
            resultType = 'bad';
        } else {
            description = `Mixed outcomes with ${newPoints} points. Maintain position in ${maintainPercentage}% of scenarios, drop in ${dropPercentage}%.`;
            resultType = 'neutral';
        }
        
        requirements.push(`${result === 'win' ? 'Beat' : result === 'draw' ? 'Draw with' : 'Limit damage against'} ${opponentName}`);
        requirements.push(`${maintainPercentage}% chance to maintain position`);
        
        probability = result === 'loss' ? 'medium' : 'low';
    }
    
    return {
        type: `${result}-scenario`,
        title: title,
        description: description,
        requirements: requirements,
        probability: probability,
        resultType: resultType,
        scenarios: scenarios
    };
}

function generateAdvancedScenariosHTML(scenarios, currentPosition) {
    if (scenarios.length === 0) {
        return '<p>No significant scenarios within the 3-point gap range for next gameweek.</p>';
    }
    
    let html = '';
    
    // Process all scenarios regardless of type, in the order they were generated
    scenarios.forEach(scenario => {
        const probabilityClass = `probability-${scenario.probability}`;
        html += `
            <div class="ai-scenario result-${scenario.resultType}">
                <div class="scenario-title">${scenario.title}</div>
                <div class="scenario-description">${scenario.description}</div>
                ${scenario.requirements && scenario.requirements.length > 0 ? `
                    <div style="margin-top: 10px;">
                        <strong>Requirements:</strong>
                        <ul style="margin: 5px 0 0 20px;">
                            ${scenario.requirements.map(req => `<li>${req}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                <span class="scenario-probability ${probabilityClass}">
                    ${scenario.probability === 'none' ? 'Not Possible' : scenario.probability.charAt(0).toUpperCase() + scenario.probability.slice(1) + ' Probability'}
                </span>
            </div>
        `;
    });
    
    return html || '<p>No relevant scenarios found within the specified point gap.</p>';
}

function calculateBasicScenarios(teamId, standings) {
    const currentPosition = standings.findIndex(t => t.id === teamId) + 1;
    const teamStanding = standings.find(t => t.id === teamId);
    const scenarios = [];
    
    if (currentPosition === 1) {
        scenarios.push({
            type: 'current-leader',
            title: '👑 Currently Leading!',
            description: 'You are at the top of the championship. Focus on maintaining your position.',
            probability: 'high',
            requirements: ['Win or draw your matches', 'Maintain goal difference advantage'],
            resultType: 'good'
        });
    } else {
        const pointsGap = standings[0].points - teamStanding.points;
        const remainingMatches = getRemainingMatches(teamId).length;
        const maxPossiblePoints = teamStanding.points + (remainingMatches * 3);
        
        if (maxPossiblePoints >= standings[0].points) {
            scenarios.push({
                type: 'can-reach-first',
                title: '🏆 Championship Still Possible',
                description: `You need ${pointsGap + 1} more points than the current leader to reach 1st place.`,
                probability: pointsGap <= 3 ? 'high' : pointsGap <= 6 ? 'medium' : 'low',
                requirements: [
                    'Win most remaining matches',
                    'Hope current leader drops points',
                    'Focus on goal difference for tie-breakers'
                ],
                resultType: 'good'
            });
        } else {
            scenarios.push({
                type: 'mathematical-elimination',
                title: '📊 Championship Mathematically Difficult',
                description: 'Reaching 1st place is very challenging with current points gap.',
                probability: 'low',
                requirements: [
                    'Win all remaining matches',
                    'Current leader must lose most matches',
                    'Need significant help from other results'
                ],
                resultType: 'neutral'
            });
        }
        
        // Position improvement scenarios
        if (currentPosition > 2) {
            scenarios.push({
                type: 'position-improvement',
                title: '📈 Improve Position',
                description: `Focus on moving up from ${currentPosition}${getOrdinalSuffix(currentPosition)} place.`,
                probability: 'medium',
                requirements: [
                    'Win your next matches',
                    'Teams above you need to drop points',
                    'Maintain consistency'
                ],
                resultType: 'neutral'
            });
        }
    }
    
    return scenarios;
}

// Keep all the original functions but simplify calculateChampionshipScenarios
function calculateChampionshipScenarios(teamId, standings) {
    return calculateBasicScenarios(teamId, standings);
}

function calculateNextGameweekScenarios(teamId, teamStanding, standings) {
    const scenarios = [];
    const currentPosition = standings.findIndex(t => t.id === teamId) + 1;
    
    // Find the next gameweek that has unplayed matches
    const nextGameweek = findNextGameweek();
    if (!nextGameweek) {
        scenarios.push({
            type: 'no-matches',
            title: 'No Upcoming Matches',
            description: 'No matches scheduled for the next gameweek.',
            probability: 'none',
            requirements: [],
            resultType: 'neutral'
        });
        return scenarios;
    }

    // Find the team's match in the next gameweek
    const teamMatch = nextGameweek.matches.find(match => 
        match.homeTeam === teamId || match.awayTeam === teamId
    );
    
    if (!teamMatch) {
        // Team doesn't play in next gameweek - analyze what others do
        return calculateRestGameweekScenarios(teamId, teamStanding, standings, nextGameweek);
    }

    // Team plays - analyze WIN, DRAW, LOSS scenarios
    const opponentId = teamMatch.homeTeam === teamId ? teamMatch.awayTeam : teamMatch.homeTeam;
    const opponent = teams.find(t => t.id === opponentId);
    const isHome = teamMatch.homeTeam === teamId;
    
    // Generate scenarios for each possible result
    const winScenarios = calculateResultScenarios(teamId, teamStanding, standings, nextGameweek, 'win', opponent, isHome);
    const drawScenarios = calculateResultScenarios(teamId, teamStanding, standings, nextGameweek, 'draw', opponent, isHome);
    const lossScenarios = calculateResultScenarios(teamId, teamStanding, standings, nextGameweek, 'loss', opponent, isHome);
    
    // Combine and sort scenarios: Win first, then Draw, then Loss
    return [...winScenarios, ...drawScenarios, ...lossScenarios];
}

function calculateRestGameweekScenarios(teamId, teamStanding, standings, nextGameweek) {
    // When team doesn't play, analyze what happens based on other teams' results
    const scenarios = [];
    const currentPosition = standings.findIndex(t => t.id === teamId) + 1;
    
    scenarios.push({
        type: 'rest-gameweek',
        title: 'Rest Gameweek - No Match',
        description: `You don't play in Gameweek ${nextGameweek.gameweek}. Your position depends on other teams' results.`,
        probability: 'high',
        requirements: ['Wait and see other teams\' results'],
        resultType: 'neutral'
    });
    
    return scenarios;
}

function calculateResultScenarios(teamId, teamStanding, standings, nextGameweek, result, opponent, isHome) {
    const scenarios = [];
    const currentPosition = standings.findIndex(t => t.id === teamId) + 1;
    const venue = isHome ? 'vs' : 'at';
    
    // Calculate team strength for probability assessment
    const teamStrength = calculateTeamStrength(teamStanding, standings);
    const opponentStrength = calculateTeamStrength(standings.find(t => t.id === opponent.id), standings);
    
    // Find all teams that are competing for top positions (within reasonable point range)
    const topCompetitors = getTopCompetitors(standings, teamId);
    
    // Analyze all possible combinations of results for competing teams
    const competitorMatches = getCompetitorMatches(nextGameweek, topCompetitors);
    const possibleOutcomes = generateCompetitorOutcomes(competitorMatches, teamId, nextGameweek, result, opponent.id);
    
    // Analyze each possible outcome
    const outcomeAnalysis = analyzeAllOutcomes(possibleOutcomes, standings, teamId, currentPosition);
    
    // Generate comprehensive description and requirements
    const probability = calculateSmartProbability(result, teamStrength, opponentStrength, isHome);
    const analysis = generateComprehensiveAnalysis(result, opponent.name, venue, outcomeAnalysis, nextGameweek.gameweek, teamId);
    
    const resultTitle = result === 'loss' ? 'LOOSE' : result.toUpperCase();
    
    scenarios.push({
        type: `${result}-scenario`,
        title: `If You ${resultTitle} ${venue} ${opponent.name}`,
        description: analysis.description,
        probability: probability,
        requirements: analysis.requirements,
        resultType: analysis.resultType
    });
    
    return scenarios;
}

function getTopCompetitors(standings, teamId) {
    // Get teams that are realistically competing for top positions
    const leader = standings[0];
    const maxGap = 4; // Teams within 9 points could still compete
    
    return standings.filter(team => {
        const pointsGap = leader.points - team.points;
        return pointsGap <= maxGap && team.id !== teamId;
    });
}

function getCompetitorMatches(gameweek, competitors) {
    // Find matches involving top competitors in this gameweek
    const competitorIds = competitors.map(c => c.id);
    
    return gameweek.matches.filter(match => 
        competitorIds.includes(match.homeTeam) || competitorIds.includes(match.awayTeam)
    );
}

function generateCompetitorOutcomes(competitorMatches, teamId, gameweek, teamResult, opponentId) {
    const outcomes = [];
    
    // For each competitor match, generate WIN/DRAW/LOSS scenarios
    const matchOutcomes = competitorMatches.map(match => {
        const homeTeam = teams.find(t => t.id === match.homeTeam);
        const awayTeam = teams.find(t => t.id === match.awayTeam);
        
        return [
            { match, result: 'home-win', homeScore: 2, awayScore: 0, desc: `${homeTeam.name} beats ${awayTeam.name}` },
            { match, result: 'draw', homeScore: 1, awayScore: 1, desc: `${homeTeam.name} draws with ${awayTeam.name}` },
            { match, result: 'away-win', homeScore: 0, awayScore: 2, desc: `${awayTeam.name} beats ${homeTeam.name}` }
        ];
    });
    
    // Generate all combinations (limit to prevent explosion)
    const maxCombinations = Math.min(27, Math.pow(3, competitorMatches.length)); // Max 27 combinations
    
    function generateCombinations(index, currentOutcome) {
        if (outcomes.length >= maxCombinations) return;
        
        if (index >= matchOutcomes.length) {
            // Add the team's own result
            const teamMatch = gameweek.matches.find(m => 
                (m.homeTeam === teamId && m.awayTeam === opponentId) ||
                (m.homeTeam === opponentId && m.awayTeam === teamId)
            );
            
            if (teamMatch) {
                const isTeamHome = teamMatch.homeTeam === teamId;
                let teamMatchResult;
                
                if (teamResult === 'win') {
                    teamMatchResult = {
                        match: teamMatch,
                        homeScore: isTeamHome ? 2 : 0,
                        awayScore: isTeamHome ? 0 : 2
                    };
                } else if (teamResult === 'draw') {
                    teamMatchResult = {
                        match: teamMatch,
                        homeScore: 1,
                        awayScore: 1
                    };
                } else { // loss
                    teamMatchResult = {
                        match: teamMatch,
                        homeScore: isTeamHome ? 0 : 2,
                        awayScore: isTeamHome ? 2 : 0
                    };
                }
                
                outcomes.push({
                    results: [...currentOutcome, teamMatchResult],
                    description: currentOutcome.map(r => r.desc).join(', ')
                });
            }
            return;
        }
        
        // Try each possible result for this match
        matchOutcomes[index].forEach(outcome => {
            if (outcomes.length < maxCombinations) {
                generateCombinations(index + 1, [...currentOutcome, outcome]);
            }
        });
    }
    
    generateCombinations(0, []);
    return outcomes;
}

function analyzeAllOutcomes(outcomes, standings, teamId, currentPosition) {
    const analysis = {
        canReachFirst: false,
        canMaintainPosition: false,
        wouldDropPosition: false,
        bestPosition: currentPosition,
        worstPosition: currentPosition,
        firstPlaceScenarios: [],
        maintainScenarios: [],
        dropScenarios: [],
        tieBreakSituations: []
    };
    
    outcomes.forEach(outcome => {
        const projectedStandings = calculateProjectedStandings(standings, outcome.results);
        const newPosition = projectedStandings.findIndex(t => t.id === teamId) + 1;
        const teamStats = projectedStandings.find(t => t.id === teamId);
        
        // Check for ties at the top
        const firstPlacePoints = projectedStandings[0].points;
        const teamsAtTop = projectedStandings.filter(t => t.points === firstPlacePoints);
        
        if (newPosition === 1) {
            analysis.canReachFirst = true;
            if (teamsAtTop.length > 1) {
                analysis.tieBreakSituations.push({
                    competitors: teamsAtTop.map(t => t.name),
                    scenario: outcome.description,
                    teamStats: teamStats
                });
            }
            analysis.firstPlaceScenarios.push(outcome.description);
        } else if (newPosition === currentPosition) {
            analysis.canMaintainPosition = true;
            analysis.maintainScenarios.push(outcome.description);
        } else if (newPosition > currentPosition) {
            analysis.wouldDropPosition = true;
            analysis.dropScenarios.push(outcome.description);
        }
        
        analysis.bestPosition = Math.min(analysis.bestPosition, newPosition);
        analysis.worstPosition = Math.max(analysis.worstPosition, newPosition);
    });
    
    return analysis;
}

function generateComprehensiveAnalysis(result, opponentName, venue, analysis, gameweek, teamId) {
    const resultText = result === 'win' ? 'beat' : result === 'draw' ? 'draw with' : 'lose to';
    let description = '';
    let requirements = [];
    let resultType = 'neutral';
    
    // Determine primary outcome and color
    if (analysis.canReachFirst) {
        resultType = 'good';
        if (analysis.tieBreakSituations.length > 0) {
            const teamName = teams.find(t => t.id === teamId)?.name;
            const competitors = [...new Set(analysis.tieBreakSituations.flatMap(t => t.competitors))].filter(name => name !== teamName);
            description = `If you ${resultText} ${opponentName}, you could reach 1st place (depending on other results). In some scenarios, you'd be tied with ${competitors.join(' and ')} - tie-breakers would decide the winner.`;
            requirements.push(`${result === 'win' ? 'Score more goals than' : result === 'draw' ? 'Match' : 'Limit damage against'} ${opponentName}`);
            requirements.push('🏆 Potential for 1st place depending on other results');
            requirements.push('⚖️ Tie-breakers may be needed - goal difference crucial');
        } else {
            description = `If you ${resultText} ${opponentName}, you would move to 1st place after Gameweek ${gameweek}!`;
            requirements.push(`${result === 'win' ? 'Score more goals than' : result === 'draw' ? 'Match' : 'Limit damage against'} ${opponentName}`);
            requirements.push('🏆 Guaranteed 1st place with this result');
        }
    } else if (analysis.canMaintainPosition && !analysis.wouldDropPosition) {
        resultType = 'neutral';
        description = `If you ${resultText} ${opponentName}, you would maintain your current position regardless of other results.`;
        requirements.push(`${result === 'win' ? 'Score more goals than' : result === 'draw' ? 'Match' : 'Limit damage against'} ${opponentName}`);
        requirements.push('📍 Position secure regardless of other matches');
    } else if (analysis.wouldDropPosition && !analysis.canMaintainPosition) {
        resultType = 'bad';
        description = `If you ${resultText} ${opponentName}, you would drop to ${analysis.worstPosition}${getOrdinalSuffix(analysis.worstPosition)} place regardless of other results.`;
        requirements.push(`${result === 'win' ? 'Score more goals than' : result === 'draw' ? 'Match' : 'Limit damage against'} ${opponentName}`);
        requirements.push('📉 Position would drop regardless of other matches');
        if (result === 'loss') {
            requirements.push('🛡️ Focus on limiting goal difference damage');
        }
    } else {
        // Mixed outcomes depending on other results
        if (analysis.bestPosition === 1) {
            resultType = 'good';
            description = `If you ${resultText} ${opponentName}, your final position depends on other results. Best case: 1st place, worst case: ${analysis.worstPosition}${getOrdinalSuffix(analysis.worstPosition)} place.`;
            requirements.push(`${result === 'win' ? 'Score more goals than' : result === 'draw' ? 'Match' : 'Limit damage against'} ${opponentName}`);
            requirements.push('🎯 1st place possible with favorable other results');
        } else if (analysis.bestPosition < analysis.worstPosition) {
            resultType = 'neutral';
            description = `If you ${resultText} ${opponentName}, your position depends on other results. You could finish between ${analysis.bestPosition}${getOrdinalSuffix(analysis.bestPosition)} and ${analysis.worstPosition}${getOrdinalSuffix(analysis.worstPosition)} place.`;
            requirements.push(`${result === 'win' ? 'Score more goals than' : result === 'draw' ? 'Match' : 'Limit damage against'} ${opponentName}`);
            requirements.push('🤞 Final position depends on other teams\' results');
        }
    }
    
    return {
        description,
        requirements,
        resultType
    };
}

function calculateTeamStrength(teamStanding, standings) {
    // Safety checks
    if (!teamStanding || !standings || standings.length === 0) {
        return 0.5; // Default neutral strength
    }
    
    const position = standings.findIndex(t => t.id === teamStanding.id) + 1;
    const totalTeams = standings.length;
    
    // Factor in multiple strength indicators with safety checks
    const positionStrength = (totalTeams - position + 1) / totalTeams; // Higher for better position
    const goalsStrength = Math.min((teamStanding.goalsFor || 0) / 20, 1); // Normalized goal scoring
    const defenseStrength = Math.max(0, 1 - ((teamStanding.goalsAgainst || 0) / 15)); // Better defense = higher
    const formStrength = calculateRecentForm(teamStanding); // Recent match history
    const efficiencyStrength = (teamStanding.played || 0) > 0 ? (teamStanding.points || 0) / ((teamStanding.played || 1) * 3) : 0; // Points per game
    
    return (positionStrength * 0.25 + goalsStrength * 0.2 + defenseStrength * 0.2 + formStrength * 0.2 + efficiencyStrength * 0.15);
}

function canRealisticallyReachFirst(teamStanding, standings, gameweek) {
    // Quick check - if team is too far behind on points, don't calculate complex scenarios
    const leader = standings[0];
    const pointsGap = leader.points - teamStanding.points;
    const maxPossiblePoints = teamStanding.points + (getRemainingMatches(teamStanding.id).length * 3);
    
    // If even winning all games wouldn't give enough points, skip complex analysis
    if (maxPossiblePoints < leader.points) {
        return false;
    }
    
    // If the gap is more than 6 points and there are less than 3 games remaining, very unlikely
    const remainingGames = getRemainingMatches(teamStanding.id).length;
    if (pointsGap > 6 && remainingGames < 3) {
        return false;
    }
    
    return true;
}

function calculateRecentForm(teamStanding) {
    // Check if matchHistory exists and is an array
    if (!teamStanding || !teamStanding.matchHistory || !Array.isArray(teamStanding.matchHistory)) {
        return 0.5; // Default neutral form
    }
    
    const recentMatches = teamStanding.matchHistory.slice(-3); // Last 3 matches
    if (recentMatches.length === 0) return 0.5;
    
    const formPoints = recentMatches.reduce((total, result) => {
        if (result === 'W') return total + 1;
        if (result === 'D') return total + 0.5;
        return total;
    }, 0);
    
    return formPoints / recentMatches.length;
}

function calculateSmartProbability(result, teamStrength, opponentStrength, isHome) {
    const homeAdvantage = isHome ? 0.1 : -0.1;
    const strengthDiff = teamStrength - opponentStrength + homeAdvantage;
    
    let baseProbability;
    if (result === 'win') {
        baseProbability = 0.33 + strengthDiff * 0.4;
    } else if (result === 'draw') {
        baseProbability = 0.33 - Math.abs(strengthDiff) * 0.2;
    } else { // loss
        baseProbability = 0.33 - strengthDiff * 0.4;
    }
    
    // Clamp between realistic bounds
    baseProbability = Math.max(0.1, Math.min(0.8, baseProbability));
    
    if (baseProbability > 0.55) return 'high';
    if (baseProbability > 0.35) return 'medium';
    return 'low';
}

function simulateGameweekWithResult(teamId, gameweek, result, opponentId) {
    const simulatedResults = [];
    
    // Find the team's match and simulate the result
    gameweek.matches.forEach(match => {
        if ((match.homeTeam === teamId && match.awayTeam === opponentId) ||
            (match.homeTeam === opponentId && match.awayTeam === teamId)) {
            
            let homeScore, awayScore;
            const isTeamHome = match.homeTeam === teamId;
            
            if (result === 'win') {
                if (isTeamHome) {
                    homeScore = 2; awayScore = 0;
                } else {
                    homeScore = 0; awayScore = 2;
                }
            } else if (result === 'draw') {
                homeScore = 1; awayScore = 1;
            } else { // loss
                if (isTeamHome) {
                    homeScore = 0; awayScore = 2;
                } else {
                    homeScore = 2; awayScore = 0;
                }
            }
            
            simulatedResults.push({
                match: match,
                homeScore: homeScore,
                awayScore: awayScore
            });
        } else {
            // For other matches, simulate realistic results based on current standings and team strengths
            simulatedResults.push(simulateOptimalMatchResult(match));
        }
    });
    
    return simulatedResults;
}

function simulateOptimalMatchResult(match) {
    // Get current standings to determine team strengths
    const currentStandings = calculateStandings();
    const homeTeam = currentStandings.find(t => t.id === match.homeTeam);
    const awayTeam = currentStandings.find(t => t.id === match.awayTeam);
    
    if (!homeTeam || !awayTeam) {
        // Fallback to random if teams not found
        return {
            match: match,
            homeScore: Math.floor(Math.random() * 3),
            awayScore: Math.floor(Math.random() * 3)
        };
    }
    
    // Calculate relative strengths based on current position and form
    const homePosition = currentStandings.findIndex(t => t.id === match.homeTeam) + 1;
    const awayPosition = currentStandings.findIndex(t => t.id === match.awayTeam) + 1;
    
    // Better positioned teams (lower position number) are stronger
    const homeStrength = calculateTeamStrength(homeTeam, currentStandings) + 0.1; // Home advantage
    const awayStrength = calculateTeamStrength(awayTeam, currentStandings);
    
    // Determine most likely result based on strength difference
    const strengthDiff = homeStrength - awayStrength;
    
    let homeScore, awayScore;
    
    if (strengthDiff > 0.2) {
        // Home team significantly stronger - likely home win
        homeScore = 2; awayScore = 0;
    } else if (strengthDiff < -0.2) {
        // Away team significantly stronger - likely away win
        homeScore = 0; awayScore = 2;
    } else if (Math.abs(strengthDiff) <= 0.1) {
        // Very evenly matched - likely draw
        homeScore = 1; awayScore = 1;
    } else if (strengthDiff > 0) {
        // Home team slightly stronger - narrow home win
        homeScore = 2; awayScore = 1;
    } else {
        // Away team slightly stronger - narrow away win
        homeScore = 1; awayScore = 2;
    }
    
    return {
        match: match,
        homeScore: homeScore,
        awayScore: awayScore
    };
}

function findNextGameweek() {
    // Find the first gameweek with unplayed matches
    for (const gameweek of fixtures) {
        const hasUnplayedMatches = gameweek.matches.some(match => {
            const result = results.find(r => r.matchId === match.id && r.played);
            return !result;
        });
        if (hasUnplayedMatches) {
            return gameweek;
        }
    }
    return null;
}

function generateMatchOutcomes(matches, teamId) {
    const outcomes = [];
    const teamMatches = matches.filter(m => m.homeTeam === teamId || m.awayTeam === teamId);
    const otherMatches = matches.filter(m => m.homeTeam !== teamId && m.awayTeam !== teamId);
    
    // For our team's matches, consider realistic score outcomes
    const teamOutcomes = [];
    teamMatches.forEach(match => {
        const isHome = match.homeTeam === teamId;
        
        // Generate realistic score scenarios: Win, Draw, Loss with different goal differences
        const scenarios = [
            { result: 'win', homeScore: isHome ? 2 : 0, awayScore: isHome ? 0 : 2, desc: 'Win 2-0' },
            { result: 'win', homeScore: isHome ? 3 : 1, awayScore: isHome ? 1 : 3, desc: 'Win 3-1' },
            { result: 'draw', homeScore: 1, awayScore: 1, desc: 'Draw 1-1' },
            { result: 'draw', homeScore: 0, awayScore: 0, desc: 'Draw 0-0' },
            { result: 'loss', homeScore: isHome ? 0 : 2, awayScore: isHome ? 2 : 0, desc: 'Lose 0-2' },
            { result: 'loss', homeScore: isHome ? 1 : 3, awayScore: isHome ? 3 : 1, desc: 'Lose 1-3' }
        ];
        
        teamOutcomes.push(scenarios);
    });
    
    // For other teams' matches, consider simple outcomes: Win Home, Draw, Win Away
    const otherOutcomes = [];
    otherMatches.forEach(match => {
        const scenarios = [
            { homeScore: 2, awayScore: 0, desc: `${teams.find(t => t.id === match.homeTeam)?.name} wins` },
            { homeScore: 1, awayScore: 1, desc: 'Draw' },
            { homeScore: 0, awayScore: 2, desc: `${teams.find(t => t.id === match.awayTeam)?.name} wins` }
        ];
        otherOutcomes.push(scenarios);
    });
    
    // Generate all combinations (limit to reasonable number)
    const maxCombinations = 24; // Limit to prevent excessive calculations
    let combinationCount = 0;
    
    function generateCombinations(teamIndex, otherIndex, currentOutcome) {
        if (combinationCount >= maxCombinations) return;
        
        if (teamIndex >= teamOutcomes.length && otherIndex >= otherOutcomes.length) {
            outcomes.push({
                results: [...currentOutcome],
                description: generateOutcomeDescription(currentOutcome, teamId)
            });
            combinationCount++;
            return;
        }
        
        if (teamIndex < teamOutcomes.length) {
            // Process team matches with higher priority (more scenarios)
            const priorityScenarios = teamOutcomes[teamIndex].slice(0, 3); // Focus on win, draw, loss
            priorityScenarios.forEach(scenario => {
                if (combinationCount < maxCombinations) {
                    generateCombinations(teamIndex + 1, otherIndex, [
                        ...currentOutcome,
                        { match: teamMatches[teamIndex], ...scenario }
                    ]);
                }
            });
        } else if (otherIndex < otherOutcomes.length) {
            // Process other matches with fewer scenarios
            otherOutcomes[otherIndex].forEach(scenario => {
                if (combinationCount < maxCombinations) {
                    generateCombinations(teamIndex, otherIndex + 1, [
                        ...currentOutcome,
                        { match: otherMatches[otherIndex], ...scenario }
                    ]);
                }
            });
        }
    }
    
    generateCombinations(0, 0, []);
    return outcomes;
}



function calculateProjectedStandings(currentStandings, matchResults) {
    // Create a copy of current standings
    const projectedStandings = currentStandings.map(team => ({
        ...team,
        played: team.played,
        wins: team.wins,
        losses: team.losses,
        draws: team.draws,
        goalsFor: team.goalsFor,
        goalsAgainst: team.goalsAgainst,
        goalDifference: team.goalDifference,
        points: team.points,
        matchHistory: [...team.matchHistory],
        headToHeadWins: {...team.headToHeadWins}
    }));
    
    // Apply match results
    matchResults.forEach(matchResult => {
        const homeTeam = projectedStandings.find(t => t.id === matchResult.match.homeTeam);
        const awayTeam = projectedStandings.find(t => t.id === matchResult.match.awayTeam);
        
        if (homeTeam && awayTeam) {
            // Update match counts
            homeTeam.played++;
            awayTeam.played++;
            
            // Update goals
            homeTeam.goalsFor += matchResult.homeScore;
            homeTeam.goalsAgainst += matchResult.awayScore;
            awayTeam.goalsFor += matchResult.awayScore;
            awayTeam.goalsAgainst += matchResult.homeScore;
            
            // Update results
            if (matchResult.homeScore > matchResult.awayScore) {
                homeTeam.wins++;
                homeTeam.points += 3;
                homeTeam.matchHistory.push('W');
                if (!homeTeam.headToHeadWins[awayTeam.id]) homeTeam.headToHeadWins[awayTeam.id] = 0;
                homeTeam.headToHeadWins[awayTeam.id]++;
                awayTeam.losses++;
                awayTeam.matchHistory.push('L');
            } else if (matchResult.homeScore < matchResult.awayScore) {
                awayTeam.wins++;
                awayTeam.points += 3;
                awayTeam.matchHistory.push('W');
                if (!awayTeam.headToHeadWins[homeTeam.id]) awayTeam.headToHeadWins[homeTeam.id] = 0;
                awayTeam.headToHeadWins[homeTeam.id]++;
                homeTeam.losses++;
                homeTeam.matchHistory.push('L');
            } else {
                homeTeam.draws++;
                homeTeam.points += 1;
                homeTeam.matchHistory.push('D');
                awayTeam.draws++;
                awayTeam.points += 1;
                awayTeam.matchHistory.push('D');
            }
            
            // Update goal difference
            homeTeam.goalDifference = homeTeam.goalsFor - homeTeam.goalsAgainst;
            awayTeam.goalDifference = awayTeam.goalsFor - awayTeam.goalsAgainst;
        }
    });
    
    // Sort with same tie-breaker rules
    projectedStandings.sort((a, b) => {
        if (a.points !== b.points) return b.points - a.points;
        if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
        if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
        const aHeadToHeadWins = Object.values(a.headToHeadWins).reduce((sum, wins) => sum + wins, 0);
        const bHeadToHeadWins = Object.values(b.headToHeadWins).reduce((sum, wins) => sum + wins, 0);
        if (aHeadToHeadWins !== bHeadToHeadWins) return bHeadToHeadWins - aHeadToHeadWins;
        return a.name.localeCompare(b.name);
    });
    
    return projectedStandings;
}

function generateOutcomeDescription(results, teamId) {
    const teamResults = results.filter(r => r.match.homeTeam === teamId || r.match.awayTeam === teamId);
    const otherResults = results.filter(r => r.match.homeTeam !== teamId && r.match.awayTeam !== teamId);
    
    let description = '';
    
    // Describe team's results
    if (teamResults.length > 0) {
        const teamDesc = teamResults.map(r => r.desc || r.result).join(', ');
        description += `You: ${teamDesc}`;
    }
    
    // Describe key competitor results
    if (otherResults.length > 0 && otherResults.length <= 3) {
        const otherDesc = otherResults.map(r => r.desc).join(', ');
        description += teamResults.length > 0 ? ` | Others: ${otherDesc}` : `Others: ${otherDesc}`;
    }
    
    return description;
}



function getOrdinalSuffix(number) {
    const j = number % 10;
    const k = number % 100;
    if (j == 1 && k != 11) return "st";
    if (j == 2 && k != 12) return "nd";
    if (j == 3 && k != 13) return "rd";
    return "th";
}

function getGoalDiffClass(goalDifference) {
    if (goalDifference > 0) return 'goal-diff-positive';
    if (goalDifference < 0) return 'goal-diff-negative';
    return 'goal-diff-zero';
}

// Forecast functionality
function updateForecast() {
    const forecastContent = document.getElementById('forecast-content');
    forecastContent.innerHTML = '<div class="loading">🔮 Analyzing team performance and generating predictions...</div>';
    
    try {
        const forecast = generateForecast();
        forecastContent.innerHTML = forecast;
    } catch (error) {
        console.error('Forecast error:', error);
        forecastContent.innerHTML = '<div class="error">Error generating forecast. Please try again.</div>';
    }
}

function generateForecast() {
    const currentStandings = calculateStandings();
    const teamAnalysis = analyzeAllTeams(currentStandings);
    const nextGameweek = findNextGameweek();
    const matchPredictions = nextGameweek ? generateMatchPredictions(nextGameweek, teamAnalysis) : null;
    const championshipForecast = generateChampionshipForecast(currentStandings, teamAnalysis);
    
    return `
        <div class="forecast-section">
            <div class="forecast-header">
                📊 Team Performance Analysis
            </div>
            <div class="forecast-content">
                ${generateTeamAnalysisHTML(teamAnalysis)}
            </div>
        </div>
        
        ${matchPredictions ? `
        <div class="forecast-section">
            <div class="forecast-header">
                ⚽ Next Gameweek Predictions (Gameweek ${nextGameweek.gameweek})
            </div>
            <div class="forecast-content">
                ${generateMatchPredictionsHTML(matchPredictions)}
            </div>
        </div>
        ` : ''}
        
        <div class="forecast-section">
            <div class="forecast-header">
                🏆 Championship Forecast
            </div>
            <div class="forecast-content">
                ${generateChampionshipForecastHTML(championshipForecast)}
            </div>
        </div>
        
        <div class="forecast-section">
            <div class="forecast-header">
                📈 Statistical Insights
            </div>
            <div class="forecast-content">
                ${generateStatisticalInsightsHTML(currentStandings, teamAnalysis)}
            </div>
        </div>
    `;
}

function analyzeAllTeams(standings) {
    return standings.map(team => {
        const teamData = analyzeTeamPerformance(team, standings);
        return {
            ...team,
            ...teamData
        };
    });
}

function analyzeTeamPerformance(team, standings) {
    const position = standings.findIndex(t => t.id === team.id) + 1;
    
    // Form analysis (recent 3 matches)
    const recentForm = calculateRecentForm(team);
    const formDescription = getFormDescription(recentForm);
    
    // Consistency analysis
    const consistency = calculateConsistency(team);
    
    // Attacking strength
    const attackingStrength = team.played > 0 ? (team.goalsFor / team.played).toFixed(1) : 0;
    
    // Defensive strength  
    const defensiveStrength = team.played > 0 ? (team.goalsAgainst / team.played).toFixed(1) : 0;
    
    // Points per game
    const pointsPerGame = team.played > 0 ? (team.points / team.played).toFixed(1) : 0;
    
    // Win percentage
    const winPercentage = team.played > 0 ? Math.round((team.wins / team.played) * 100) : 0;
    
    // Performance rating (0-10 scale)
    const performanceRating = calculatePerformanceRating(team, standings);
    
    // Momentum (recent trend)
    const momentum = calculateMomentum(team);
    
    return {
        position,
        recentForm,
        formDescription,
        consistency,
        attackingStrength: parseFloat(attackingStrength),
        defensiveStrength: parseFloat(defensiveStrength),
        pointsPerGame: parseFloat(pointsPerGame),
        winPercentage,
        performanceRating,
        momentum
    };
}

function getFormDescription(formScore) {
    if (formScore >= 0.8) return { text: "Excellent", color: "#27ae60", icon: "🔥" };
    if (formScore >= 0.6) return { text: "Good", color: "#2ecc71", icon: "📈" };
    if (formScore >= 0.4) return { text: "Average", color: "#f39c12", icon: "➡️" };
    if (formScore >= 0.2) return { text: "Poor", color: "#e67e22", icon: "📉" };
    return { text: "Very Poor", color: "#e74c3c", icon: "🔴" };
}

function calculateConsistency(team) {
    if (!team.matchHistory || team.matchHistory.length < 2) return 0.5;
    
    // Calculate how consistent the results are
    const results = team.matchHistory;
    let consistencyScore = 0;
    
    // Check for patterns and consistency in results
    const wins = results.filter(r => r === 'W').length;
    const draws = results.filter(r => r === 'D').length;
    const losses = results.filter(r => r === 'L').length;
    
    const total = results.length;
    const dominantResult = Math.max(wins, draws, losses);
    
    // Higher consistency if one result type dominates
    consistencyScore = dominantResult / total;
    
    return Math.min(consistencyScore, 1);
}

function calculatePerformanceRating(team, standings) {
    const totalTeams = standings.length;
    const position = standings.findIndex(t => t.id === team.id) + 1;
    
    // Position score (0-3)
    const positionScore = ((totalTeams - position + 1) / totalTeams) * 3;
    
    // Points efficiency (0-2)
    const maxPossiblePoints = team.played * 3;
    const pointsEfficiency = maxPossiblePoints > 0 ? (team.points / maxPossiblePoints) * 2 : 0;
    
    // Goal difference score (0-2)
    const goalDiffScore = Math.max(0, Math.min(2, (team.goalDifference + 10) / 10));
    
    // Form score (0-2)
    const formScore = calculateRecentForm(team) * 2;
    
    // Win rate score (0-1)
    const winRateScore = team.played > 0 ? (team.wins / team.played) : 0;
    
    const totalScore = positionScore + pointsEfficiency + goalDiffScore + formScore + winRateScore;
    return Math.min(10, Math.max(0, totalScore));
}

function calculateMomentum(team) {
    if (!team.matchHistory || team.matchHistory.length < 2) {
        return { direction: "Stable", strength: "Neutral", color: "#95a5a6", icon: "➡️" };
    }
    
    const recent = team.matchHistory.slice(-3);
    const earlier = team.matchHistory.slice(-6, -3);
    
    if (recent.length === 0) return { direction: "Stable", strength: "Neutral", color: "#95a5a6", icon: "➡️" };
    
    const recentPoints = recent.reduce((sum, result) => {
        return sum + (result === 'W' ? 3 : result === 'D' ? 1 : 0);
    }, 0) / recent.length;
    
    const earlierPoints = earlier.length > 0 ? earlier.reduce((sum, result) => {
        return sum + (result === 'W' ? 3 : result === 'D' ? 1 : 0);
    }, 0) / earlier.length : recentPoints;
    
    const momentum = recentPoints - earlierPoints;
    
    if (momentum > 0.5) return { direction: "Rising", strength: "Strong", color: "#27ae60", icon: "📈" };
    if (momentum > 0) return { direction: "Rising", strength: "Slight", color: "#2ecc71", icon: "⬆️" };
    if (momentum < -0.5) return { direction: "Declining", strength: "Strong", color: "#e74c3c", icon: "📉" };
    if (momentum < 0) return { direction: "Declining", strength: "Slight", color: "#e67e22", icon: "⬇️" };
    
    return { direction: "Stable", strength: "Neutral", color: "#95a5a6", icon: "➡️" };
}

function generateMatchPredictions(nextGameweek, teamAnalysis) {
    return nextGameweek.matches.map(match => {
        const homeTeam = teamAnalysis.find(t => t.id === match.homeTeam);
        const awayTeam = teamAnalysis.find(t => t.id === match.awayTeam);
        
        if (!homeTeam || !awayTeam) return null;
        
        const prediction = predictMatch(homeTeam, awayTeam);
        
        return {
            match,
            homeTeam,
            awayTeam,
            prediction
        };
    }).filter(p => p !== null);
}

function predictMatch(homeTeam, awayTeam) {
    // Home advantage factor
    const homeAdvantage = 0.3;
    
    // Calculate team strengths
    const homeStrength = homeTeam.performanceRating + homeAdvantage + (homeTeam.recentForm * 2);
    const awayStrength = awayTeam.performanceRating + (awayTeam.recentForm * 2);
    
    const strengthDiff = homeStrength - awayStrength;
    
    // Calculate probabilities
    let homeWinProb, drawProb, awayWinProb;
    
    if (strengthDiff > 2) {
        homeWinProb = 65; drawProb = 25; awayWinProb = 10;
    } else if (strengthDiff > 1) {
        homeWinProb = 55; drawProb = 30; awayWinProb = 15;
    } else if (strengthDiff > 0) {
        homeWinProb = 45; drawProb = 35; awayWinProb = 20;
    } else if (strengthDiff > -1) {
        homeWinProb = 35; drawProb = 35; awayWinProb = 30;
    } else if (strengthDiff > -2) {
        homeWinProb = 25; drawProb = 30; awayWinProb = 45;
    } else {
        homeWinProb = 15; drawProb = 25; awayWinProb = 60;
    }
    
    // Predict most likely result
    let predictedResult, confidence;
    if (homeWinProb > drawProb && homeWinProb > awayWinProb) {
        predictedResult = 'home';
        confidence = homeWinProb;
    } else if (awayWinProb > drawProb) {
        predictedResult = 'away';
        confidence = awayWinProb;
    } else {
        predictedResult = 'draw';
        confidence = drawProb;
    }
    
    // Predict score based on attacking/defensive strengths
    const homeGoals = Math.max(0, Math.round(homeTeam.attackingStrength + (strengthDiff > 0 ? 0.5 : 0)));
    const awayGoals = Math.max(0, Math.round(awayTeam.attackingStrength + (strengthDiff < 0 ? 0.5 : 0)));
    
    return {
        result: predictedResult,
        confidence,
        homeWinProb,
        drawProb,
        awayWinProb,
        predictedScore: `${homeGoals}-${awayGoals}`,
        reasoning: generatePredictionReasoning(homeTeam, awayTeam, strengthDiff)
    };
}

function generatePredictionReasoning(homeTeam, awayTeam, strengthDiff) {
    const reasons = [];
    
    if (Math.abs(strengthDiff) > 1.5) {
        const stronger = strengthDiff > 0 ? homeTeam : awayTeam;
        reasons.push(`${stronger.name} has significantly better form and performance`);
    }
    
    if (homeTeam.recentForm > awayTeam.recentForm + 0.3) {
        reasons.push(`${homeTeam.name} in much better recent form`);
    } else if (awayTeam.recentForm > homeTeam.recentForm + 0.3) {
        reasons.push(`${awayTeam.name} in much better recent form`);
    }
    
    if (homeTeam.attackingStrength > awayTeam.defensiveStrength + 1) {
        reasons.push(`${homeTeam.name}'s attack vs ${awayTeam.name}'s defense favors home team`);
    } else if (awayTeam.attackingStrength > homeTeam.defensiveStrength + 1) {
        reasons.push(`${awayTeam.name}'s attack could exploit ${homeTeam.name}'s defense`);
    }
    
    reasons.push(`Home advantage for ${homeTeam.name}`);
    
    return reasons.slice(0, 3).join('. ') + '.';
}

function generateChampionshipForecast(standings, teamAnalysis) {
    const remainingGameweeks = fixtures.length - (results.filter(r => r.played).length / (standings.length / 2));
    
    // Simulate rest of season
    const projections = teamAnalysis.map(team => {
        const remainingMatches = getRemainingMatches(team.id).length;
        const expectedPoints = team.points + (remainingMatches * team.pointsPerGame * team.recentForm);
        
        return {
            ...team,
            projectedPoints: Math.round(expectedPoints),
            championshipProbability: calculateChampionshipProbability(team, teamAnalysis, remainingMatches)
        };
    });
    
    // Sort by projected points
    projections.sort((a, b) => {
        if (a.projectedPoints !== b.projectedPoints) return b.projectedPoints - a.projectedPoints;
        if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
        return b.goalsFor - a.goalsFor;
    });
    
    return {
        projections,
        remainingGameweeks: Math.max(0, remainingGameweeks)
    };
}

function calculateChampionshipProbability(team, allTeams, remainingMatches) {
    const currentLeader = allTeams[0];
    const pointsGap = currentLeader.points - team.points;
    
    // Base probability on current position
    let baseProbability = Math.max(0, (6 - team.position) / 6 * 100);
    
    // Adjust for form and performance
    baseProbability *= (team.recentForm + team.performanceRating / 10) / 2;
    
    // Adjust for points gap
    if (pointsGap > remainingMatches * 3) {
        baseProbability = 0; // Mathematically impossible
    } else if (pointsGap > 0) {
        baseProbability *= Math.max(0.1, 1 - (pointsGap / (remainingMatches * 3)));
    }
    
    // Boost for current leader
    if (team.position === 1) {
        baseProbability = Math.max(baseProbability, 25);
    }
    
    return Math.min(95, Math.max(1, Math.round(baseProbability)));
}

// HTML Generation functions for forecast display
function generateTeamAnalysisHTML(teamAnalysis) {
    return `
        <div class="team-analysis-grid">
            ${teamAnalysis.map(team => `
                <div class="team-analysis-card ${team.position <= 2 ? 'top-team' : ''}">
                    <div class="team-header">
                        <div class="team-position">${team.position}</div>
                        <div class="team-info">
                            <h3>${team.name}</h3>
                            <div class="team-record">${team.wins}W-${team.draws}D-${team.losses}L (${team.points} pts)</div>
                        </div>
                        <div class="performance-rating">
                            <div class="rating-circle" style="background: linear-gradient(45deg, ${getRatingColor(team.performanceRating)}, ${getRatingColor(team.performanceRating)}cc)">
                                ${team.performanceRating.toFixed(1)}
                            </div>
                        </div>
                    </div>
                    
                    <div class="team-metrics">
                        <div class="metric">
                            <span class="metric-label">Form:</span>
                            <span class="metric-value" style="color: ${team.formDescription.color}">
                                ${team.formDescription.icon} ${team.formDescription.text}
                            </span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Momentum:</span>
                            <span class="metric-value" style="color: ${team.momentum.color}">
                                ${team.momentum.icon} ${team.momentum.direction}
                            </span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Attack:</span>
                            <span class="metric-value">${team.attackingStrength} goals/game</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Defense:</span>
                            <span class="metric-value">${team.defensiveStrength} conceded/game</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Win Rate:</span>
                            <span class="metric-value">${team.winPercentage}%</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function generateMatchPredictionsHTML(predictions) {
    return `
        <div class="match-predictions">
            ${predictions.map(pred => `
                <div class="match-prediction-card">
                    <div class="match-teams">
                        <div class="team-prediction home-team">
                            <h4>${pred.homeTeam.name}</h4>
                            <div class="team-form">Form: ${pred.homeTeam.formDescription.icon} ${pred.homeTeam.formDescription.text}</div>
                            <div class="win-probability">${pred.prediction.homeWinProb}%</div>
                        </div>
                        
                        <div class="match-center">
                            <div class="vs-divider">VS</div>
                            <div class="predicted-score">${pred.prediction.predictedScore}</div>
                            <div class="prediction-confidence">
                                ${pred.prediction.confidence}% confidence
                            </div>
                            <div class="draw-probability">
                                Draw: ${pred.prediction.drawProb}%
                            </div>
                        </div>
                        
                        <div class="team-prediction away-team">
                            <h4>${pred.awayTeam.name}</h4>
                            <div class="team-form">Form: ${pred.awayTeam.formDescription.icon} ${pred.awayTeam.formDescription.text}</div>
                            <div class="win-probability">${pred.prediction.awayWinProb}%</div>
                        </div>
                    </div>
                    
                    <div class="prediction-reasoning">
                        <strong>Analysis:</strong> ${pred.prediction.reasoning}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function generateChampionshipForecastHTML(forecast) {
    return `
        <div class="championship-forecast">
            <h3>🏆 Final Standings Projection</h3>
            <div class="projected-table">
                ${forecast.projections.map((team, index) => `
                    <div class="projected-position ${index === 0 ? 'champion' : index < 3 ? 'podium' : ''}">
                        <div class="proj-rank">${index + 1}</div>
                        <div class="proj-team">${team.name}</div>
                        <div class="proj-points">${team.projectedPoints} pts</div>
                        <div class="proj-probability">${team.championshipProbability}% chance</div>
                    </div>
                `).join('')}
            </div>
            
            <div class="forecast-summary">
                <h4>Championship Predictions:</h4>
                <div class="top-candidates">
                    ${forecast.projections.slice(0, 3).map(team => `
                        <div class="candidate">
                            <strong>${team.name}</strong>: ${team.championshipProbability}% chance
                            ${team.position === 1 ? ' (Current Leader)' : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

function generateStatisticalInsightsHTML(standings, teamAnalysis) {
    const topScorer = teamAnalysis.reduce((max, team) => team.goalsFor > max.goalsFor ? team : max);
    const bestDefense = teamAnalysis.reduce((min, team) => team.goalsAgainst < min.goalsAgainst ? team : min);
    const bestForm = teamAnalysis.reduce((max, team) => team.recentForm > max.recentForm ? team : max);
    const mostConsistent = teamAnalysis.reduce((max, team) => team.consistency > max.consistency ? team : max);
    
    return `
        <div class="statistical-insights">
            <div class="insight-cards">
                <div class="insight-card">
                    <div class="insight-title">⚽ Top Scorer</div>
                    <div class="insight-team">${topScorer.name}</div>
                    <div class="insight-value">${topScorer.goalsFor} goals (${topScorer.attackingStrength}/game)</div>
                </div>
                
                <div class="insight-card">
                    <div class="insight-title">🛡️ Best Defense</div>
                    <div class="insight-team">${bestDefense.name}</div>
                    <div class="insight-value">${bestDefense.goalsAgainst} conceded (${bestDefense.defensiveStrength}/game)</div>
                </div>
                
                <div class="insight-card">
                    <div class="insight-title">📈 Best Form</div>
                    <div class="insight-team">${bestForm.name}</div>
                    <div class="insight-value">${bestForm.formDescription.icon} ${bestForm.formDescription.text}</div>
                </div>
                
                <div class="insight-card">
                    <div class="insight-title">⚖️ Most Consistent</div>
                    <div class="insight-team">${mostConsistent.name}</div>
                    <div class="insight-value">${Math.round(mostConsistent.consistency * 100)}% consistency</div>
                </div>
            </div>
            
            <div class="league-stats">
                <h4>League Statistics:</h4>
                <div class="stats-grid">
                    <div>Average goals per game: ${(teamAnalysis.reduce((sum, t) => sum + t.goalsFor, 0) / teamAnalysis.reduce((sum, t) => sum + t.played, 0)).toFixed(1)}</div>
                    <div>Most competitive matchup: Teams closest in performance rating</div>
                    <div>Surprise factor: ${teamAnalysis.filter(t => Math.abs(t.position - (7 - t.performanceRating)) > 1).length} teams performing above/below expectations</div>
                </div>
            </div>
        </div>
    `;
}

function getRatingColor(rating) {
    if (rating >= 8) return '#27ae60';
    if (rating >= 6) return '#2ecc71';
    if (rating >= 4) return '#f39c12';
    if (rating >= 2) return '#e67e22';
    return '#e74c3c';
}

// Helper functions for forecast
function calculateRecentForm(team) {
    if (!team.matchHistory || team.matchHistory.length === 0) return 0.5;
    
    const recentMatches = team.matchHistory.slice(-3); // Last 3 matches
    if (recentMatches.length === 0) return 0.5;
    
    const points = recentMatches.reduce((sum, result) => {
        if (result === 'W') return sum + 1;
        if (result === 'D') return sum + 0.5;
        return sum;
    }, 0);
    
    return points / recentMatches.length;
}

function findNextGameweek() {
    for (let gameweek of fixtures) {
        const hasUnplayedMatch = gameweek.matches.some(match => {
            return !results.some(result => 
                result.gameweek === gameweek.gameweek &&
                result.homeTeam === match.homeTeam &&
                result.awayTeam === match.awayTeam
            );
        });
        
        if (hasUnplayedMatch) {
            // Only return matches that haven't been played
            const unplayedMatches = gameweek.matches.filter(match => {
                return !results.some(result => 
                    result.gameweek === gameweek.gameweek &&
                    result.homeTeam === match.homeTeam &&
                    result.awayTeam === match.awayTeam
                );
            });
            
            return {
                gameweek: gameweek.gameweek,
                matches: unplayedMatches
            };
        }
    }
    return null; // All matches played
}

function getRemainingMatches(teamId) {
    const remainingMatches = [];
    
    for (let gameweek of fixtures) {
        for (let match of gameweek.matches) {
            if (match.homeTeam === teamId || match.awayTeam === teamId) {
                // Check if this match hasn't been played
                const isPlayed = results.some(result => 
                    result.gameweek === gameweek.gameweek &&
                    result.homeTeam === match.homeTeam &&
                    result.awayTeam === match.awayTeam
                );
                
                if (!isPlayed) {
                    remainingMatches.push({
                        ...match,
                        gameweek: gameweek.gameweek
                    });
                }
            }
        }
    }
    
    return remainingMatches;
}