# Admin Guide - Football Results Simulator

## 🔐 Admin Mode Activation

Open browser console (F12) and run:
```javascript
footballAdmin.enableAdmin()
```

## ➕ Adding Match Results

1. **Enable Admin Mode** using the console command above
2. **Go to Fixtures tab** - you'll see green **+** buttons next to upcoming matches
3. **Click the + button** to open the result entry modal
4. **Enter scores** for both teams
5. **Click "Add Result"** - the result will be saved and displayed immediately

## 📁 Data Storage Explanation

### How It Works:

1. **Add Result** - Result is added to memory (visible immediately) and downloads updated JSON file
2. **Download** - Updated `group-phase-results.json` file is automatically downloaded to your Downloads folder
3. **Replace File** - Replace `data/group-phase-results.json` with the downloaded file
4. **Refresh Page** - Page will load from the updated file (no localStorage caching)

### Workflow:

1. **Add results** using the admin interface
2. **Check Downloads folder** - updated `group-phase-results.json` will be there
3. **Replace** `data/group-phase-results.json` with the downloaded file  
4. **Refresh page** - results will be loaded from the updated file

## 🛠 Console Commands

```javascript
// Admin controls
footballAdmin.enableAdmin()          // Enable admin mode
footballAdmin.disableAdmin()         // Disable admin mode
footballAdmin.toggleValidation()     // Toggle time validation
footballAdmin.showConfig()           // Show current configuration

// Data management
footballAdmin.exportResults()        // Export all results to console and download
footballAdmin.downloadResults()      // Download current group-phase-results.json
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

## 🤖 OpenAI Integration

### API Key Configuration:

**Option 1: config.json file (Recommended)**
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

### Rate Limiting & Error Handling:
- **Automatic Retries**: 3 attempts with exponential backoff
- **Rate Limit Handling**: Intelligent delays for 429 errors
- **Timeout Protection**: 30-second request timeout
- **Graceful Fallbacks**: Custom analysis when AI fails

### Cost Optimization:
- **Token Limits**: Default 500 tokens (configurable 50-2000)
- **Usage Tracking**: Monitor tokens and estimated costs
- **Efficient Prompts**: Optimized for concise responses
- **Stop Sequences**: Prevent overly long responses

### Usage:
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

## ⏰ Time Validation

By default, you cannot add results for matches that haven't started yet. To disable this validation:

```javascript
footballAdmin.toggleValidation()
```

## 🎯 Button Position

The green **+** button appears to the left of the date/time with proper spacing for better UX.

## 🔄 Data Flow

1. **Add Result** → Added to memory + Downloaded as file
2. **Replace File** → Copy downloaded file to `data/group-phase-results.json`
3. **Refresh Page** → Loads fresh data from updated file
4. **Clean State** → No cached data, always reads from actual file

This approach ensures you always work with the actual file data and changes are immediately reflected after file replacement and refresh!