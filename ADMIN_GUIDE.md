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
2. **Download** - Updated `results.json` file is automatically downloaded to your Downloads folder
3. **Replace File** - Replace `data/results.json` with the downloaded file
4. **Refresh Page** - Page will load from the updated file (no localStorage caching)

### Workflow:

1. **Add results** using the admin interface
2. **Check Downloads folder** - updated `results.json` will be there
3. **Replace** `data/results.json` with the downloaded file  
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
footballAdmin.downloadResults()      // Download current results.json
footballAdmin.reloadPage()           // Reload page after updating file
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
2. **Replace File** → Copy downloaded file to `data/results.json`
3. **Refresh Page** → Loads fresh data from updated file
4. **Clean State** → No cached data, always reads from actual file

This approach ensures you always work with the actual file data and changes are immediately reflected after file replacement and refresh!