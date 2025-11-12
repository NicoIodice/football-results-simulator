# ⚽ Multi-Sport Tournament Manager

A comprehensive multi-sport tournament management system featuring real-time standings, fixture management, match results, goal scorer tracking, injury management, championship scenarios, and AI-powered forecasts.

## 🌟 Key Features

### 📊 **League Standings & Overview**
- **Real-time Table**: Dynamic standings with points, wins, draws, losses, goal difference
- **First Place Highlighting**: Golden gradient highlighting for championship leaders
- **Tie-breaker Analysis**: Comprehensive head-to-head (TB3) calculations
- **Match History**: Visual form indicators (W/D/L) for recent performance
- **Top Scorers**: Goal statistics with visual indicators and injury tracking
- **Responsive Design**: Mobile-friendly table layout with dark mode support

### 📅 **Fixtures & Results Management**
- **Gameweek Organization**: Fixtures grouped by gameweek across all groups with date-based sorting
- **Match Status Indicators**: Clear distinction between completed, upcoming, and cancelled matches
- **Cancelled Match Highlighting**: Yellow background indicator for cancelled fixtures
- **Live Score Display**: Styled score presentation for completed matches
- **Date & Time Information**: Complete scheduling details with time-only display on match cards
- **Admin Controls**: Add/edit match results with optional goal scorer tracking

### ⚽ **Goal Scorer Tracking**
- **Optional Selection**: Add scorers when entering match results (completely optional)
- **Automatic Display**: Scorer section appears automatically when goals are entered
- **Collapsible UI**: Show/Hide toggle to keep the interface clean
- **Two-Team Layout**: Side-by-side display of home and away team players
- **Injury Awareness**: Automatically disables injured players based on match date
- **Validation**: Total goals must match the final score if scorers are entered
- **Both Stages**: Works for Group Stage fixtures and Knockout Stage matches

### 🤕 **Player Injury Tracking**
- **Date-Based Tracking**: Track injuries with start dates and optional end dates
- **Visual Indicators**: Red background tint and 🤕 badge for injured players
- **Smart Disabling**: Injured players automatically disabled in scorer selection
- **Flexible Management**: Add/update injuries directly in `teams.json`
- **Recovery Tracking**: Support for indefinite injuries or time-based recovery

### 🎯 **Championship Simulator**
- **Team Selection**: Analyze any team's championship prospects
- **Current Position Analysis**: Real-time statistics and league standing
- **Remaining Matches**: Complete fixture list for selected team
- **Scenario Generation**: Multiple championship pathways analysis
- **Group Stage & Knockout**: Simulation support for both tournament phases

#### Scenario Types:
1. **"Win All Remaining Matches"**
   - Direct path to championship through perfect record
   - Points projection and feasibility assessment

2. **"Win All + Competitors Must Drop Points"**
   - Advanced scenarios when perfect record isn't sufficient
   - Specific competitor match requirements
   - Detailed loss calculations for each rival

3. **"Realistic Championship Path"**
   - Balanced approach for teams within 6 points of leaders
   - Mixed win/draw scenarios with strategic flexibility
   - Goal difference optimization strategies

4. **"Tie-breaker Scenarios"**
   - Head-to-head point calculations
   - Specific goal requirements (e.g., "needs 6+ goals vs opponent")
   - Real examples like "6-0, 7-0" victory requirements

5. **"Mathematically Impossible"**
   - Clear indication when championship is no longer achievable
   - Focus redirection to best possible final position

### 🔮 **AI-Powered Forecast**
- **Team Performance Analysis**: Comprehensive statistical evaluation of all teams
- **Next Gameweek Predictions**: Match outcome forecasts with confidence levels
- **Championship Probability**: Season-end projections and title chances
- **Statistical Insights**: League-wide performance metrics and trends

#### Forecast Features:
- **Performance Rating**: 0-10 scale team evaluation
- **Form Analysis**: Recent match trend assessment
- **Momentum Tracking**: Performance trajectory analysis
- **Match Predictions**: Score predictions with probability breakdowns
- **Championship Odds**: Data-driven title probability calculations
- **OpenRouter Integration**: Flexible AI model selection (view models at https://openrouter.ai/)

## 🎨 Visual Design

### Color-Coded Analysis:
- **🟢 Green**: High probability scenarios / Strong performance
- **🟡 Yellow**: Medium probability / Average performance / Cancelled matches
- **🔴 Red**: Low probability / Poor performance / Injured players
- **🏆 Gold**: Championship position highlighting

### Interactive Elements:
- **Probability Badges**: Visual confidence indicators
- **Hover Effects**: Enhanced user interaction
- **Gradient Backgrounds**: Modern, professional styling
- **Responsive Layout**: Optimized for all devices
- **Dark Mode**: Full theme support across all features

## 🧠 Intelligent Analysis

### Advanced Calculations:
- **Tie-breaker Rules**: Full implementation of head-to-head regulations
- **Goal Difference Strategy**: Smart recommendations for high-scoring victories
- **Probability Assessment**: Mathematical probability calculations
- **Competitive Analysis**: Multi-team scenario evaluation

### Performance Metrics:
- **Recent Form**: Weighted analysis of last 3 matches
- **Consistency Rating**: Performance reliability measurement
- **Attacking Strength**: Goals per game analysis
- **Defensive Rating**: Goals conceded evaluation
- **Win Percentage**: Success rate calculations

---

## 📖 Admin Guide

### 🔐 Admin Mode Activation

Open browser console (F12) and run:
```javascript
footballAdmin.enableAdmin()
```

### ➕ Adding Match Results

1. **Enable Admin Mode** using the console command above
2. **Go to Fixtures tab** - you'll see green **+** buttons next to upcoming matches
3. **Click the + button** to open the result entry modal
4. **Enter scores** for both teams
5. **(Optional) Click "Show Scorers"** to expand and add goal scorers
6. **Click "Add Result"** - the result will be saved and downloaded as JSON

### 📁 Data Storage & Workflow

#### How It Works:
1. **Add Result** - Result is added to memory (visible immediately) and downloads updated JSON file
2. **Download** - Updated `group-stage-results.json` file is automatically downloaded to your Downloads folder
3. **Replace File** - Replace `data/2025/futsal/group-stage-results.json` with the downloaded file
4. **Refresh Page** - Page will load from the updated file (no localStorage caching)

This approach ensures you always work with the actual file data and changes are immediately reflected after file replacement and refresh!

### 🛠 Console Commands

```javascript
// Admin controls
footballAdmin.enableAdmin()          // Enable admin mode
footballAdmin.disableAdmin()         // Disable admin mode
footballAdmin.toggleValidation()     // Toggle time validation
footballAdmin.showConfig()           // Show current configuration

// Data management
footballAdmin.exportResults()        // Export all results to console and download
footballAdmin.downloadResults()      // Download current group-stage-results.json
footballAdmin.reloadPage()           // Reload page after updating file

// OpenAI controls
footballAdmin.enableOpenAI()         // Enable AI-powered analysis
footballAdmin.disableOpenAI()        // Disable AI-powered analysis
footballAdmin.checkOpenAI()          // Check OpenAI client status

// Cost optimization
footballAdmin.setMaxTokens(300)      // Set token limit (50-2000)
footballAdmin.getTokenStats()        // View usage statistics
footballAdmin.resetTokenStats()      // Reset usage counters

// Rate limiting
footballAdmin.setRetryAttempts(3)    // Set retry attempts (1-5)
```

### 🤖 OpenAI Integration

#### API Key Configuration:

**Option 1: app-config.json file (Recommended)**
```json
{"OPENAI_API_KEY": "your-actual-api-key-here"}
```

**Option 2: .env file (Fallback)**
```properties
OPENAI_API_KEY=your-actual-api-key-here
```

**Option 3: Manual entry**
- Use the simulator interface to enter your API key manually
- Key is stored in session storage for current session only

#### Rate Limiting & Error Handling:
- **Automatic Retries**: 3 attempts with exponential backoff
- **Rate Limit Handling**: Intelligent delays for 429 errors
- **Timeout Protection**: 30-second request timeout
- **Graceful Fallbacks**: Custom analysis when AI fails

#### Cost Optimization:
- **Token Limits**: Default 500 tokens (configurable 50-2000)
- **Usage Tracking**: Monitor tokens and estimated costs
- **Efficient Prompts**: Optimized for concise responses
- **Stop Sequences**: Prevent overly long responses

#### Usage:
```javascript
// Enable AI with cost monitoring
footballAdmin.enableOpenAI()

// Check current usage
footballAdmin.getTokenStats()

// Optimize for lower costs
footballAdmin.setMaxTokens(300)

// Check configuration
footballAdmin.showConfig()
```

### ⏰ Time Validation

By default, you cannot add results for matches that haven't started yet. To disable this validation:

```javascript
footballAdmin.toggleValidation()
```

---

## ⚽ Goal Scorer Selection

### Overview
Optional goal scorer tracking when adding match results for both Group Stage and Knockout Stage matches.

### How to Use

#### Group Stage Matches
1. Navigate to **Fixtures** tab
2. Click **Add Result** on any fixture
3. Enter home and away scores
4. Scorer section appears automatically if goals > 0
5. Click **Show Scorers** to expand
6. Enter number of goals for each scorer
7. Click **Add Result** to save

#### Knockout Stage Matches
1. Navigate to **Knockout** tab (under Simulator)
2. Click **Add Result** on a knockout match
3. Enter home and away scores
4. If scores are tied, penalty shootout appears
5. Scorer section appears automatically if goals > 0
6. Click **Show Scorers** to expand
7. Enter number of goals for each scorer
8. Click **Add Result** to save

### Validation Rules
1. **Optional Scorers**: You can add results without specifying scorers
2. **Goals Must Match**: If you enter scorers, total goals must match the score
   - Example: Home 3-2 Away requires exactly 3 home scorers' goals and 2 away scorers' goals
3. **Injured Players Cannot Score**: Injured players' input fields are disabled

### Data Structure

Scorers are stored in the match result object as an array:

```json
{
  "matchId": "match-a1",
  "homeScore": 3,
  "awayScore": 2,
  "played": true,
  "scorers": [
    {
      "playerId": "john-smith",
      "playerName": "John Smith",
      "goals": 2
    },
    {
      "playerId": "mike-jones",
      "playerName": "Mike Jones",
      "goals": 1
    },
    {
      "playerId": "opponent-player",
      "playerName": "Opponent Player",
      "goals": 2
    }
  ]
}
```

**Storage Locations:**
- **Group Stage**: `data/2025/futsal/group-stage-results.json`
- **Knockout Stage**: `data/2025/futsal/knockout-stage-results.json`

---

## 🤕 Player Injury Tracking

### Overview
Track player injuries with automatic integration into the scorer selection system. Injured players are automatically disabled when adding match results.

### How to Add Injury Data

Add an `injury` object to any player in `teams.json`:

```json
{
  "id": "player-id",
  "name": "Player Name",
  "number": 10,
  "position": "midfielder",
  "status": "injured",
  "isStarter": true,
  "isCaptain": false,
  "injury": {
    "startDate": "2025-10-15",
    "endDate": "2025-11-05",
    "reason": "Ankle sprain"
  }
}
```

### Injury Object Properties

- **`startDate`** (required): Date when the injury occurred (format: `YYYY-MM-DD`)
- **`endDate`** (optional): Date when player returns to fitness (format: `YYYY-MM-DD`)
  - If omitted, player is considered injured indefinitely
- **`reason`** (optional): Description of the injury (e.g., "Hamstring strain", "Concussion")

### Examples

#### Short-term injury (1 week)
```json
"injury": {
  "startDate": "2025-10-20",
  "endDate": "2025-10-27",
  "reason": "Minor muscle strain"
}
```

#### Long-term injury (indefinite)
```json
"injury": {
  "startDate": "2025-09-30",
  "reason": "ACL tear - season ending"
}
```

#### Player recovered (injury in the past)
```json
"injury": {
  "startDate": "2025-09-15",
  "endDate": "2025-10-01",
  "reason": "Hamstring - fully recovered"
}
```

### Visual Indicators

**Injured players:**
- Red background tint
- Red player number badge
- 🤕 "Injured" badge
- Input field disabled
- Cursor shows "not-allowed"

**Active scorers:**
- Green background when goals > 0
- Green border highlight
- Goals input field enabled

### Tips

- Update the `status` field to `"injured"` for clarity (optional, not required for functionality)
- Use clear injury reasons for reference
- Set realistic end dates based on injury severity
- Remove the `injury` object completely when player fully recovers

**Note**: The injury tracking only affects the scorer selection UI. It does not prevent players from appearing in team lineups or formations.

---

## 🔧 Technical Implementation

### Core Technologies:
- **HTML5**: Modern semantic structure
- **CSS3**: Advanced styling with gradients, animations, and dark mode
- **JavaScript ES6+**: Dynamic functionality and calculations
- **Responsive Design**: Mobile-first approach
- **JSON Data Storage**: File-based data management for teams, fixtures, results

### Data Structure:
- `teams.json`: Team information, player rosters, injuries, associations
- `groups.json`: Group definitions and team assignments
- `fixtures.json`: Match schedule and fixture details
- `group-stage-results.json`: Match results and goal scorers for group stage
- `knockout-stage-results.json`: Knockout match results and scorers
- `tournament-settings.json`: Tournament configuration and feature toggles
- `app-settings.json`: Application settings and admin configuration

### Key Functions:
- `calculateAdvancedScenarios()`: Multi-scenario championship analysis
- `analyzeTieBreaker()`: Head-to-head calculations with specific examples
- `updateForecast()`: AI-powered prediction generation
- `predictMatch()`: Individual match outcome forecasting
- `generateChampionshipForecast()`: Season-end projections
- `isPlayerInjured()`: Date-based injury checking
- `renderTeamScorers()`: Renders player list with injury detection
- `validateScorers()`: Validates total goals match score

## 📱 Usage Guide

### Getting Started:
1. Open `index.html` in your web browser
2. Navigate through tabs: Overview → Teams → Fixtures → Forecast → Simulator
3. Use admin mode to add match results and track scorers
4. Explore AI predictions in the Forecast tab
5. Simulate championship scenarios in the Simulator tab

### Simulator Instructions:
1. **Select Team**: Choose from dropdown in the simulator
2. **Review Position**: Check current standings and statistics
3. **Analyze Scenarios**: Review all possible championship paths
4. **Understand Probabilities**: Use color coding and badges for assessment
5. **Knockout Simulation**: Simulate playoff rounds and finals

### Match Management:
1. **Enable Admin Mode**: Use console command `footballAdmin.enableAdmin()`
2. **Add Results**: Click green + buttons on fixtures
3. **Track Scorers**: Optionally add goal scorer details
4. **Manage Injuries**: Update player injuries in `teams.json`
5. **Download Data**: Results automatically download as JSON files
6. **Replace Files**: Update data files and refresh to see changes

## 🎯 Perfect For:

- **Tournament Organizers**: Complete tournament management solution
- **Sports Analysts**: Professional match and league analysis
- **Sports Fans**: Understanding championship mathematics
- **Team Management**: Strategic planning and scenario preparation
- **Educators**: Teaching probability and sports mathematics
- **Fantasy Sports**: Advanced team performance insights

## 🔒 Security & Privacy

- **API Key Handling**: OpenAI API keys stored only in session storage (not persistent)
- **No Server Required**: Runs entirely in the browser for maximum privacy
- **Local Processing**: All data analysis happens client-side
- **No Data Collection**: No personal or usage data is transmitted externally
- **File-Based Storage**: All tournament data stored in local JSON files

## 🚀 Future Enhancements

- Historical data integration
- Advanced statistical modeling
- Export functionality for analysis reports (CSV, PDF)
- Real-time data API integration
- Enhanced mobile experience
- Multi-tournament support
- Player performance tracking
- Team formation editor
- Advanced injury management system

---

*This multi-sport tournament manager combines mathematical precision with intuitive design to provide a comprehensive tournament management and analysis tool.*

**Powered by OpenRouter AI** - View available models at https://openrouter.ai/