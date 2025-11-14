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

## 🏗️ Application Architecture

### Overview
This section describes the modular architecture of the Multi-Sport Tournament Manager application.

### Project Structure

```
multi-sport-tournament-manager/
├── js/
│   ├── logger.js          # Centralized logging system
│   ├── errorHandler.js    # Error handling utilities
│   ├── dataLoader.js      # Data loading from various sources
│   └── app.js             # Main application logic
├── data/
│   ├── app-settings.json  # Application configuration
│   └── 2025/
│       └── futsal/
│           ├── tournament-settings.json
│           ├── teams.json
│           ├── groups.json
│           ├── fixtures.json
│           ├── group-stage-results.json
│           └── knockout-stage-results.json
└── index.html             # Main HTML file
```

### Module Descriptions

#### 1. logger.js
**Purpose**: Provides centralized logging functionality that respects debug mode settings.

**Key Features**:
- Debug mode toggle (controlled via `app-settings.json`)
- Multiple log levels: `log`, `warn`, `error`, `info`, `debug`
- Errors are always logged regardless of debug mode
- Integrates with error handler for user-facing error messages

**Functions**:
- `setAppSettings(settings)` - Initialize logger with app settings
- `logger.log()` - Debug-mode-only logging
- `logger.warn()` - Debug-mode-only warnings
- `logger.error()` - Always shown, triggers error handler
- `logger.info()` - Debug-mode-only information
- `logger.debug()` - Debug-mode-only debug messages

**Usage**:
```javascript
// In main script
setAppSettings(appSettings);

// Anywhere in the application
logger.log('Debug information');
logger.error('Something went wrong', error);
```

#### 2. errorHandler.js
**Purpose**: Handles errors consistently across the application with user-friendly toast notifications.

**Key Features**:
- Distinguishes between business logic errors and technical errors
- User-friendly error messages
- Toast notification integration
- Async function error wrapper

**Functions**:
- `handleError(error)` - Process and display errors to users
- `withErrorHandling(fn)` - Wrap async functions with automatic error handling

**Usage**:
```javascript
// Manual error handling
try {
    // some operation
} catch (error) {
    handleError(error);
}

// Automatic error wrapping
const safeFunction = withErrorHandling(async () => {
    // async operations
});
```

#### 3. dataLoader.js
**Purpose**: Abstract data loading to support multiple sources (local files, databases, remote APIs).

**Key Features**:
- Configurable loading methods via `app-settings.json`
- Validation of loading method configuration
- Centralized data loading logic
- Support for future data sources

**Supported Loading Methods**:
- `local-file` - Load from local JSON files (default)
- `local-db` - Load from local database (not yet implemented)
- `remote-api` - Load from remote API (not yet implemented)
- `remote-dropbox` - Load from Dropbox (not yet implemented)
- `remote-github` - Load from GitHub (not yet implemented)

**Functions**:
- `getLoadingMethod(appSettings)` - Get configured loading method
- `isValidLoadingMethod(method)` - Validate loading method
- `loadAppSettings()` - Load application settings
- `loadTournamentSettings()` - Load tournament configuration
- `loadOpenAIKeyFromConfig()` - Load OpenAI API key from config
- `loadOpenAIKeyFromEnv()` - Load OpenAI API key from .env (fallback)
- `loadJSONData(filePath, method)` - Generic JSON data loader

**Usage**:
```javascript
// Load with configured method
const settings = await loadAppSettings();
const loadingMethod = getLoadingMethod(settings);
const tournamentData = await loadTournamentSettings(loadingMethod);

// Load generic JSON data
const teams = await loadJSONData('data/2025/futsal/teams.json', loadingMethod);
```

#### 4. app.js
**Purpose**: Main application logic, UI interactions, and business logic.

**Responsibilities**:
- Tournament data management
- UI rendering and interactions
- Match result management
- Simulation and forecast logic
- OpenRouter/AI integration

**Key Sections**:
- Global state variables
- OpenAI/OpenRouter configuration
- Tab navigation
- Standings calculations
- Fixture rendering
- Knockout stage management
- Admin functions

### Configuration

#### app-settings.json
```json
{
  "data": {
    "loadingMethod": "local-file"  // Configures data source
  },
  "ui": {
    "showLoadingMask": true,
    "enableDebugMode": false,      // Controls logger output
    "enableDarkMode": true
  },
  "admin": {
    "role": "admin",
    "validateTime": true
  },
  "openAI": {
    "baseURL": "https://openrouter.ai/api/v1",
    "model": "openai/gpt-4o",
    "maxTokens": 500,
    "temperature": 0.7,
    "retryAttempts": 3,
    "retryDelay": 1000,
    "timeoutMs": 30000
  }
}
```

#### Loading Method Configuration

The `data.loadingMethod` property in `app-settings.json` controls where the application loads data from:

- **`local-file`** (default): Load from local JSON files in the `data/` directory
- **`local-db`**: Load from browser's IndexedDB (future)
- **`remote-api`**: Load from a REST API (future)
- **`remote-dropbox`**: Load from Dropbox (future)
- **`remote-github`**: Load from GitHub repository (future)

**Validation**: Invalid loading methods will default to `local-file` with a warning.

### Script Loading Order

The scripts must be loaded in the following order in `index.html`:

```html
<!-- Core utility modules (load in order) -->
<script src="./js/logger.js"></script>
<script src="./js/errorHandler.js"></script>
<script src="./js/dataLoader.js"></script>

<!-- Main application script -->
<script src="./js/app.js"></script>
```

**Why this order?**
1. **logger.js** - Provides logging functionality used by all other modules
2. **errorHandler.js** - Depends on logger, provides error handling for all modules
3. **dataLoader.js** - Depends on logger and errorHandler, loads configuration
4. **app.js** - Main application, depends on all utility modules

### Development Guidelines

#### Adding New Loading Methods

To add a new data source:

1. Add the method to `DATA_LOADING_METHODS` in `dataLoader.js`:
```javascript
const DATA_LOADING_METHODS = {
    // ... existing methods
    MY_NEW_METHOD: 'my-new-method'
};
```

2. Implement the loader function:
```javascript
async function loadFromMySource(filePath) {
    // Implementation
    return data;
}
```

3. Add case to `loadData()` switch statement:
```javascript
switch (loadingMethod) {
    // ... existing cases
    case DATA_LOADING_METHODS.MY_NEW_METHOD:
        return await loadFromMySource(filePath);
    // ...
}
```

4. Update `app-settings.json` to use new method:
```json
{
  "data": {
    "loadingMethod": "my-new-method"
  }
}
```

#### Error Handling Best Practices

1. **Use logger for all logging**:
   ```javascript
   logger.log('Info message');    // Only in debug mode
   logger.error('Error', err);    // Always shown + toast
   ```

2. **Wrap async functions with error handling**:
   ```javascript
   const safeFn = withErrorHandling(async () => {
       // Your code
   });
   ```

3. **Provide user-friendly error messages**:
   ```javascript
   throw new Error('Team not found: ' + teamId);  // Good
   throw new Error('Error');                       // Bad
   ```

#### Debugging

Enable debug mode in `app-settings.json`:
```json
{
  "ui": {
    "enableDebugMode": true
  }
}
```

This will output all `logger.log()`, `logger.warn()`, `logger.info()`, and `logger.debug()` calls to the console.

### Planned Architecture Enhancements

1. **Remote Data Sources**:
   - GitHub repository integration
   - Dropbox file sync
   - REST API support
   - Real-time database integration

2. **Data Caching**:
   - IndexedDB for offline support
   - Service worker for PWA functionality
   - Cache invalidation strategies

3. **Module System**:
   - ES6 modules (import/export)
   - Build system (Webpack/Rollup)
   - Code splitting

4. **Testing**:
   - Unit tests for each module
   - Integration tests
   - E2E tests

### Migration Notes

#### Changes from Previous Architecture

**Before**:
- All code in single `script.js` file
- Logger defined inline
- Error handlers scattered throughout
- Data loading functions mixed with business logic

**After**:
- Modular architecture with separate concerns
- Centralized logger with configuration
- Unified error handling
- Abstracted data loading with multiple source support

**Benefits**:
- ✅ Better code organization
- ✅ Easier testing and maintenance
- ✅ Flexible data source configuration
- ✅ Consistent error handling and logging
- ✅ Smaller, more focused files

---

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

## Authentication & Routing Update

### Authentication System
- **Created**: `data/users.json` with admin credentials
- **Created**: `js/auth/auth.js` - Authentication module with login/logout functionality
- **Features**:
  - Session-based authentication using `sessionStorage`
  - User validation against `users.json`
  - Auto-redirect to login if not authenticated
  - Logout functionality with session cleanup

### URL-Based Routing
- **Created**: `js/router.js` - URL routing module
- **Features**:
  - Hash-based routing (#/overview, #/teams, etc.)
  - URL updates when switching tabs
  - Direct URL navigation support
  - Route validation with fallback to /overview

### How It Works

### Login Flow
1. User visits root URL (`/`)
2. `index.html` loads with login form
3. User enters credentials (default: admin/admin)
4. `auth.js` validates against `data/users.json`
5. On success: Session token stored, redirect to `/pages/app.html#/overview`
6. On failure: Error message displayed

### Authentication Check
1. `pages/app.html` loads
2. Inline script imports `auth.js` and calls `requireAuth()`
3. If not authenticated: Redirect to `/`
4. If authenticated: Initialize router and load app

### URL Routing
1. Router listens for hash changes (`hashchange` event)
2. When tab clicked: `showTab()` called → Updates URL via `updateURL()`
3. URL change triggers `hashchange` → Router navigates to tab
4. Direct URL access: Router parses hash and activates correct tab

### Logout
1. User clicks logout button (🚪 icon in header)
2. Calls `logout()` from `auth.js`
3. Session cleared from `sessionStorage`
4. Redirect to `/` (login page)

## URL Routes

- `/` - Login page
- `/pages/app.html#/overview` - Overview tab (default)
- `/pages/app.html#/teams` - Teams tab
- `/pages/app.html#/fixtures` - Fixtures tab
- `/pages/app.html#/forecast` - Forecast tab
- `/pages/app.html#/simulator` - Simulator tab

## Testing Credentials

- **Username**: admin
- **Password**: admin

## No Features Broken

All existing functionality preserved:
- ✅ Tab navigation
- ✅ Data loading
- ✅ Settings modal
- ✅ Dark mode toggle
- ✅ All tournament features
- ✅ AI predictions
- ✅ Knockout stage
- ✅ Statistics
- ✅ Team formations

## Browser Compatibility

- Modern browsers with ES6 module support
- `sessionStorage` support required
- Hash-based routing (works with GitHub Pages)

## Security Notes

⚠️ **Current Implementation**:
- Authentication is client-side only
- User credentials stored in plain JSON
- Session token is simple Base64 encoding

🔒 **For Production**:
- Move authentication to server-side
- Use proper password hashing (bcrypt, etc.)
- Implement JWT or similar token system
- Add HTTPS enforcement
- Add session timeout
- Add brute-force protection

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

---

*Last Updated: November 12, 2025*